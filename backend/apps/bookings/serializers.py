from rest_framework import serializers

from apps.catalog.models import Session

from .models import Booking


class BookingSessionSerializer(serializers.ModelSerializer):
    creator_username = serializers.CharField(source="creator.username", read_only=True)

    class Meta:
        model = Session
        fields = ["id", "title", "location", "start_time", "duration_minutes", "creator_username"]


class BookingSerializer(serializers.ModelSerializer):
    session = BookingSessionSerializer(read_only=True)
    is_past = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ["id", "session", "status", "created_at", "cancelled_at", "is_past"]

    def get_is_past(self, obj) -> bool:
        return obj.session.has_started


class BookingCreateSerializer(serializers.Serializer):
    session = serializers.IntegerField()
