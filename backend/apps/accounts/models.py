from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model. Accounts are provisioned via GitHub OAuth, so there
    is no usable password. `role` drives backend authorization checks —
    it is never trusted from the frontend on write, only read.
    """

    class Role(models.TextChoices):
        USER = "user", "User"
        CREATOR = "creator", "Creator"

    role = models.CharField(max_length=16, choices=Role.choices, default=Role.USER)

    github_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    github_username = models.CharField(max_length=255, blank=True)
    avatar_url = models.URLField(blank=True)
    bio = models.TextField(blank=True, max_length=500)

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_creator(self) -> bool:
        return self.role == self.Role.CREATOR

    def __str__(self) -> str:
        return self.username
