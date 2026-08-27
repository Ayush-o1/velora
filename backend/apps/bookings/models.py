from django.conf import settings
from django.db import models


class Booking(models.Model):
    """
    A user's booking of a session.

    Concurrency-critical invariants:
      * A session can never have more ACTIVE bookings than its capacity.
      * A user can never hold more than one ACTIVE booking for the same
        session at once.

    The capacity invariant is enforced in `apps.bookings.services` via
    `select_for_update()` inside a transaction (it depends on counting
    sibling rows, which a plain column constraint cannot express).

    The duplicate-booking invariant IS expressible as a single-row
    constraint and is additionally enforced at the database level below,
    as defense in depth independent of application code paths.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bookings",
    )
    session = models.ForeignKey(
        "catalog.Session",
        on_delete=models.CASCADE,
        related_name="bookings",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["session", "status"], name="bookings_session_status_idx"),
            models.Index(fields=["user", "status"], name="bookings_user_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "session"],
                condition=models.Q(status="active"),
                name="unique_active_booking_per_user_session",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} -> {self.session} ({self.status})"
