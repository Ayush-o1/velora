from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "avatar_url",
            "bio",
            "github_username",
            "date_joined",
        ]
        read_only_fields = ["id", "username", "email", "github_username", "date_joined"]


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["first_name", "last_name", "bio", "role"]

    def validate_role(self, value):
        if value not in (User.Role.USER, User.Role.CREATOR):
            raise serializers.ValidationError("role must be 'user' or 'creator'.")
        return value


class GitHubCallbackSerializer(serializers.Serializer):
    code = serializers.CharField()
