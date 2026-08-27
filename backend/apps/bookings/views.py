from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.catalog.models import Session

from . import services
from .models import Booking
from .serializers import BookingCreateSerializer, BookingSerializer


def _error(code: str, detail: str, http_status: int) -> Response:
    return Response({"error": {"code": code, "detail": detail}}, status=http_status)


class BookingViewSet(GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BookingSerializer

    def get_queryset(self):
        return Booking.objects.filter(user=self.request.user).select_related("session", "session__creator")

    def create(self, request):
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_id = serializer.validated_data["session"]

        try:
            booking = services.create_booking(user=request.user, session_id=session_id)
        except Session.DoesNotExist:
            return _error("session_not_found", "Session does not exist.", status.HTTP_404_NOT_FOUND)
        except services.SessionAlreadyStartedError as exc:
            return _error(exc.code, exc.message, status.HTTP_400_BAD_REQUEST)
        except services.CannotBookOwnSessionError as exc:
            return _error(exc.code, exc.message, status.HTTP_403_FORBIDDEN)
        except (services.SessionFullError, services.DuplicateBookingError) as exc:
            return _error(exc.code, exc.message, status.HTTP_409_CONFLICT)

        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def me(self, request):
        scope = request.query_params.get("scope")
        qs = self.get_queryset()
        now = timezone.now()
        if scope == "active":
            qs = qs.filter(status=Booking.Status.ACTIVE, session__start_time__gt=now)
        elif scope == "past":
            qs = qs.filter(session__start_time__lte=now) | qs.filter(status=Booking.Status.CANCELLED)

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(qs, many=True).data)

    def destroy(self, request, pk=None):
        # The router's default lookup regex accepts any non-slash segment,
        # so `DELETE /api/bookings/abc/` reaches here with a non-numeric pk.
        # Passing that straight to the ORM raised an unhandled ValueError
        # (a 500 on plainly malformed input); an id that cannot exist is a
        # 404, the same answer as an id that simply doesn't.
        try:
            booking_id = int(pk)
        except (TypeError, ValueError):
            return _error("booking_not_found", "Booking not found.", status.HTTP_404_NOT_FOUND)

        try:
            booking = services.cancel_booking(user=request.user, booking_id=booking_id)
        except Booking.DoesNotExist:
            return _error("booking_not_found", "Booking not found.", status.HTTP_404_NOT_FOUND)
        except services.SessionAlreadyStartedError:
            return _error(
                "session_already_started",
                "This session has already started; the booking can no longer be cancelled.",
                status.HTTP_400_BAD_REQUEST,
            )
        return Response(BookingSerializer(booking).data, status=status.HTTP_200_OK)
