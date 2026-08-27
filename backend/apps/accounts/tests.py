from datetime import timedelta
from unittest.mock import patch

import pytest
import requests
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.tokens import AccessToken

from .models import User
from .services import GitHubOAuthError, GitHubProfile


def auth_header(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def fake_profile(github_id="12345", login="octocat", email="octocat@example.com"):
    return GitHubProfile(
        github_id=github_id,
        login=login,
        name="The Octocat",
        avatar_url="https://avatars.githubusercontent.com/u/1",
        email=email,
    )


@pytest.mark.django_db
def test_me_requires_authentication(api_client):
    response = api_client.get("/api/auth/me/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_invalid_token_is_rejected(api_client):
    response = api_client.get("/api/auth/me/", **auth_header("this.is.not-a-valid-jwt"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] in ("token_not_valid", "not_authenticated")


@pytest.mark.django_db
def test_expired_token_is_rejected(api_client, plain_user):
    # `AccessToken.lifetime` is bound as a class attribute from api_settings
    # at import time, so overriding the SIMPLE_JWT setting at test-run time
    # does NOT change how long a freshly-issued token lives (this bit us —
    # see PROMPT_LOG.md). `set_exp()` sets the claim on this token instance
    # directly, which is the documented way to mint an already-expired token.
    token = AccessToken.for_user(plain_user)
    token.set_exp(lifetime=timedelta(seconds=-1))
    response = api_client.get("/api/auth/me/", **auth_header(str(token)))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_not_valid"


@pytest.mark.django_db
def test_valid_token_grants_access(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.get("/api/auth/me/", **auth_header(str(token)))
    assert response.status_code == 200
    assert response.json()["username"] == plain_user.username


@pytest.mark.django_db
def test_user_can_update_own_profile(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.patch(
        "/api/auth/me/",
        {"first_name": "Ada", "bio": "Booking enthusiast."},
        format="json",
        **auth_header(str(token)),
    )
    assert response.status_code == 200
    assert response.json()["first_name"] == "Ada"
    assert response.json()["bio"] == "Booking enthusiast."


@pytest.mark.django_db
def test_user_can_become_a_creator_via_profile_update(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.patch(
        "/api/auth/me/", {"role": "creator"}, format="json", **auth_header(str(token))
    )
    assert response.status_code == 200
    assert response.json()["role"] == "creator"


@pytest.mark.django_db
def test_invalid_role_value_is_rejected(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.patch(
        "/api/auth/me/", {"role": "admin"}, format="json", **auth_header(str(token))
    )
    assert response.status_code == 400


# --- GitHub OAuth callback ---------------------------------------------
#
# The actual network call to GitHub (`exchange_code_for_profile`) can't be
# exercised in an automated test without a real user's GitHub consent, so
# it's mocked here — but everything downstream of it (get_or_create, JWT
# issuance, the refresh cookie's attributes) is the exact same code that
# runs when a real browser completes the flow, and is tested for real.


@pytest.mark.django_db
def test_github_callback_creates_new_user_and_issues_tokens(api_client):
    with patch("apps.accounts.views.exchange_code_for_profile", return_value=fake_profile()):
        response = api_client.post("/api/auth/github/callback/", {"code": "fake-code"}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert "access" in body and body["access"]
    assert body["user"]["username"] or body["user"]["github_username"] == "octocat"

    user = User.objects.get(github_id="12345")
    assert user.email == "octocat@example.com"
    assert user.github_username == "octocat"
    assert user.has_usable_password() is False

    cookie = response.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert cookie is not None and cookie.value
    assert cookie["httponly"] is True
    assert cookie["path"] == "/api/auth/"
    assert cookie["samesite"] == settings.REFRESH_COOKIE_SAMESITE


@pytest.mark.django_db
def test_github_callback_reuses_existing_user_and_updates_profile(api_client):
    with patch("apps.accounts.views.exchange_code_for_profile", return_value=fake_profile()):
        api_client.post("/api/auth/github/callback/", {"code": "first-login"}, format="json")

    assert User.objects.filter(github_id="12345").count() == 1

    updated = fake_profile()
    updated.avatar_url = "https://avatars.githubusercontent.com/u/999"
    with patch("apps.accounts.views.exchange_code_for_profile", return_value=updated):
        response = api_client.post("/api/auth/github/callback/", {"code": "second-login"}, format="json")

    assert response.status_code == 200
    assert User.objects.filter(github_id="12345").count() == 1
    user = User.objects.get(github_id="12345")
    assert user.avatar_url == "https://avatars.githubusercontent.com/u/999"


@pytest.mark.django_db
def test_github_callback_oauth_exchange_failure_returns_400(api_client):
    with patch(
        "apps.accounts.views.exchange_code_for_profile",
        side_effect=GitHubOAuthError("bad code"),
    ):
        response = api_client.post("/api/auth/github/callback/", {"code": "bad-code"}, format="json")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "oauth_exchange_failed"


@pytest.mark.django_db
def test_github_callback_provider_unreachable_returns_502(api_client):
    with patch(
        "apps.accounts.views.exchange_code_for_profile",
        side_effect=requests.ConnectionError("network down"),
    ):
        response = api_client.post("/api/auth/github/callback/", {"code": "any-code"}, format="json")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "oauth_provider_unreachable"


# --- Refresh + logout ----------------------------------------------------


@pytest.mark.django_db
def test_refresh_without_cookie_returns_401(api_client):
    response = api_client.post("/api/auth/refresh/")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "refresh_missing"


@pytest.mark.django_db
def test_refresh_with_garbage_cookie_returns_401_and_clears_it(api_client):
    api_client.cookies[settings.REFRESH_COOKIE_NAME] = "not-a-real-token"
    response = api_client.post("/api/auth/refresh/")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "refresh_invalid"
    cleared = response.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert cleared is not None
    assert cleared.value == "" or cleared["max-age"] == 0


@pytest.mark.django_db
def test_refresh_rotates_token_and_issues_new_access_token(api_client, plain_user):
    old_refresh = RefreshToken.for_user(plain_user)
    api_client.cookies[settings.REFRESH_COOKIE_NAME] = str(old_refresh)

    response = api_client.post("/api/auth/refresh/")

    assert response.status_code == 200
    body = response.json()
    assert "access" in body and body["access"]
    assert body["user"]["username"] == plain_user.username

    new_cookie = response.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert new_cookie is not None
    assert new_cookie.value != str(old_refresh)

    # Rotation blacklists the old token — reusing it must fail.
    api_client.cookies[settings.REFRESH_COOKIE_NAME] = str(old_refresh)
    reuse_response = api_client.post("/api/auth/refresh/")
    assert reuse_response.status_code == 401


@pytest.mark.django_db
def test_logout_clears_cookie_and_blacklists_refresh_token(api_client, plain_user):
    refresh = RefreshToken.for_user(plain_user)
    api_client.cookies[settings.REFRESH_COOKIE_NAME] = str(refresh)

    response = api_client.post("/api/auth/logout/")
    assert response.status_code == 204
    cleared = response.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert cleared is not None
    assert cleared.value == "" or cleared["max-age"] == 0

    # The blacklisted token must no longer work for a refresh.
    api_client.cookies[settings.REFRESH_COOKIE_NAME] = str(refresh)
    reuse_response = api_client.post("/api/auth/refresh/")
    assert reuse_response.status_code == 401


@pytest.mark.django_db
def test_logout_without_cookie_still_returns_204(api_client):
    response = api_client.post("/api/auth/logout/")
    assert response.status_code == 204
