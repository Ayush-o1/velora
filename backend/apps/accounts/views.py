import requests
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import GitHubCallbackSerializer, ProfileUpdateSerializer, UserSerializer
from .services import GitHubOAuthError, exchange_code_for_profile


def _set_refresh_cookie(response, token: str) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        domain=settings.REFRESH_COOKIE_DOMAIN,
        path="/api/auth/",
    )


def _clear_refresh_cookie(response) -> None:
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path="/api/auth/",
        domain=settings.REFRESH_COOKIE_DOMAIN,
    )


def _unique_username(base: str) -> str:
    candidate = base
    suffix = 1
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


class GitHubCallbackView(APIView):
    """
    Exchanges a GitHub OAuth `code` (obtained by the frontend redirect) for
    a Velora session: get-or-create the user, issue a JWT pair, and set the
    refresh token as an httpOnly cookie. The GitHub client secret never
    reaches the frontend — this exchange happens server-side only.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GitHubCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        try:
            profile = exchange_code_for_profile(code)
        except GitHubOAuthError as exc:
            return Response(
                {"error": {"code": "oauth_exchange_failed", "detail": str(exc)}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.RequestException:
            return Response(
                {"error": {"code": "oauth_provider_unreachable", "detail": "Could not reach GitHub. Try again."}},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        user, created = User.objects.get_or_create(
            github_id=profile.github_id,
            defaults={
                "username": _unique_username(profile.login),
                "email": profile.email,
                "first_name": profile.name,
                "avatar_url": profile.avatar_url,
                "github_username": profile.login,
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        else:
            dirty_fields = []
            if user.avatar_url != profile.avatar_url:
                user.avatar_url = profile.avatar_url
                dirty_fields.append("avatar_url")
            if user.github_username != profile.login:
                user.github_username = profile.login
                dirty_fields.append("github_username")
            if dirty_fields:
                user.save(update_fields=dirty_fields)

        refresh = RefreshToken.for_user(user)
        response = Response(
            {"access": str(refresh.access_token), "user": UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )
        _set_refresh_cookie(response, str(refresh))
        return response


class RefreshView(APIView):
    """Rotates the refresh cookie and issues a new access token."""

    permission_classes = [AllowAny]

    def post(self, request):
        raw_token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw_token:
            return Response(
                {"error": {"code": "refresh_missing", "detail": "No refresh token cookie present."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            old_refresh = RefreshToken(raw_token)
            # `is_active` matters here specifically: DRF's JWTAuthentication
            # already refuses an access token for a deactivated user, but
            # this endpoint resolves the user itself, so without the filter
            # a disabled account could keep minting fresh access tokens for
            # as long as its refresh token lived.
            user = User.objects.get(pk=old_refresh["user_id"], is_active=True)
        except (TokenError, User.DoesNotExist):
            response = Response(
                {"error": {"code": "refresh_invalid", "detail": "Refresh token is invalid or expired."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_refresh_cookie(response)
            return response

        try:
            old_refresh.blacklist()
        except AttributeError:
            pass

        new_refresh = RefreshToken.for_user(user)
        response = Response({"access": str(new_refresh.access_token), "user": UserSerializer(user).data})
        _set_refresh_cookie(response, str(new_refresh))
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw_token:
            try:
                RefreshToken(raw_token).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)
