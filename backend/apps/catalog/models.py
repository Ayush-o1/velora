from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Session(models.Model):
    """A bookable session offered by a Creator."""

    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True, help_text="e.g. 'Online' or a physical address")
    start_time = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    capacity = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_time"]
        indexes = [
            models.Index(fields=["start_time"], name="catalog_session_start_idx"),
            models.Index(fields=["creator"], name="catalog_session_creator_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.start_time:%Y-%m-%d %H:%M})"

    @property
    def has_started(self) -> bool:
        from django.utils import timezone

        return self.start_time <= timezone.now()
