from django.utils import timezone
from rest_framework import serializers

from .models import Session


class SessionCreatorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    avatar_url = serializers.CharField()


class SessionSerializer(serializers.ModelSerializer):
    creator = SessionCreatorSerializer(read_only=True)
    seats_taken = serializers.SerializerMethodField()
    seats_remaining = serializers.SerializerMethodField()
    has_started = serializers.BooleanField(read_only=True)
    viewer_has_booked = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            "id",
            "creator",
            "title",
            "description",
            "location",
            "start_time",
            "duration_minutes",
            "capacity",
            "seats_taken",
            "seats_remaining",
            "has_started",
            "viewer_has_booked",
            "created_at",
            "updated_at",
        ]

    def get_seats_taken(self, obj) -> int:
        return getattr(obj, "active_booking_count", 0)

    def get_seats_remaining(self, obj) -> int:
        return max(obj.capacity - getattr(obj, "active_booking_count", 0), 0)

    def get_viewer_has_booked(self, obj) -> bool:
        """
        Whether the *requesting* user already holds an active booking here.
        Annotated on the queryset (`viewer_active_booking`) rather than
        queried per row, so a 20-item catalog page stays one query instead
        of twenty-one. Always False for anonymous callers.
        """
        return bool(getattr(obj, "viewer_active_booking", False))


class SessionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = ["title", "description", "location", "start_time", "duration_minutes", "capacity"]

    def validate_start_time(self, value):
        """
        A session in the past can never be booked (`create_booking` rejects
        started sessions), so publishing one just puts dead stock in the
        public catalog. Editing an already-started session's *other* fields
        stays allowed: the check only fires when `start_time` actually
        changes, so a full PUT that re-sends the same timestamp still works.
        """
        if self.instance is not None and value == self.instance.start_time:
            return value
        if value <= timezone.now():
            raise serializers.ValidationError("Start time must be in the future.")
        return value

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Capacity must be at least 1.")

        if self.instance is not None:
            from apps.bookings.models import Booking

            active = self.instance.bookings.filter(status=Booking.Status.ACTIVE).count()
            if value < active:
                raise serializers.ValidationError(
                    f"{active} {'person has' if active == 1 else 'people have'} already booked this "
                    f"session, so capacity cannot be lowered below {active}. "
                    "Capacity can still be raised, or lowered once bookings are cancelled."
                )
        return value
