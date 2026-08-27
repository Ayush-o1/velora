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
            "created_at",
            "updated_at",
        ]

    def get_seats_taken(self, obj) -> int:
        return getattr(obj, "active_booking_count", 0)

    def get_seats_remaining(self, obj) -> int:
        return max(obj.capacity - getattr(obj, "active_booking_count", 0), 0)


class SessionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = ["title", "description", "location", "start_time", "duration_minutes", "capacity"]

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("capacity must be at least 1.")
        return value
