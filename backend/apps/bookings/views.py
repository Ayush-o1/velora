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
            return Response(
                {"error": {"code": "session_not_found", "detail": "Session does not exist."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        except services.SessionAlreadyStartedError:
            return Response(
                {"error": {"code": "session_already_started", "detail": "This session has already started."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except services.SessionFullError:
            return Response(
                {"error": {"code": "session_full", "detail": "This session is fully booked."}},
                status=status.HTTP_409_CONFLICT,
            )
        except services.DuplicateBookingError:
            return Response(
                {
                    "error": {
                        "code": "duplicate_booking",
                        "detail": "You already have an active booking for this session.",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )

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
        serializer = self.get_serializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def destroy(self, request, pk=None):
        try:
            booking = services.cancel_booking(user=request.user, booking_id=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": {"code": "booking_not_found", "detail": "Booking not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        except services.SessionAlreadyStartedError:
            return Response(
                {
                    "error": {
                        "code": "session_already_started",
                        "detail": "This session has already started; the booking can no longer be cancelled.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(BookingSerializer(booking).data, status=status.HTTP_200_OK)
