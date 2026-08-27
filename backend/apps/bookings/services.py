"""
Booking creation, isolated from the view layer so the transactional
behavior can be unit- and race-tested directly.

Why `select_for_update()` on the Session row:

The capacity invariant ("active bookings for a session <= capacity") is
an aggregate over sibling rows, not a single-row fact, so it cannot be
expressed as a plain column CHECK constraint. Postgres can't atomically
"increment a count and enforce a ceiling" across a set of independent
booking inserts without something serializing access to that set.

`select_for_update()` takes a row lock on the target Session for the
duration of the transaction. If two requests race to book the same
session, the second blocks at the `SELECT ... FOR UPDATE` until the
first's transaction commits (or rolls back). It then re-reads the active
booking count *after* the first transaction's effects are visible, so it
makes its capacity decision against fresh data — not a stale read taken
before the first booking landed. This is what actually closes the race:
without the lock, both requests could read "0 of 1 taken" concurrently
and both insert successfully.

The duplicate-active-booking invariant ("one user, one active booking per
session") is a single-row fact and IS expressible as a database
constraint (`unique_active_booking_per_user_session`, a partial unique
index on Booking). That constraint is kept as defense in depth even
though the session-row lock already serializes same-session requests,
because it protects the invariant unconditionally -- independent of
whether every code path remembers to take the lock.
"""

from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog.models import Session

from .models import Booking


class BookingError(Exception):
    code = "booking_error"
    message = "Could not create booking."


class SessionAlreadyStartedError(BookingError):
    code = "session_already_started"
    message = "This session has already started."


class SessionFullError(BookingError):
    code = "session_full"
    message = "This session is fully booked."


class DuplicateBookingError(BookingError):
    code = "duplicate_booking"
    message = "You already have an active booking for this session."


class CannotBookOwnSessionError(BookingError):
    code = "cannot_book_own_session"
    message = "You are hosting this session, so you cannot book a seat on it."


@dataclass
class BookingResult:
    booking: Booking


@transaction.atomic
def create_booking(*, user, session_id: int) -> Booking:
    # Raises Session.DoesNotExist, which the view maps to a 404.
    session = Session.objects.select_for_update().get(pk=session_id)

    if session.start_time <= timezone.now():
        raise SessionAlreadyStartedError

    # The host occupies no seat of their own — enforced here rather than
    # only in the UI, since the frontend's "this is your own session"
    # notice is not a security boundary and a direct POST bypasses it.
    if session.creator_id == user.id:
        raise CannotBookOwnSessionError

    # Checked before capacity deliberately: if this user is themselves the
    # reason the session reads as full (they already hold the seat), the
    # correct, specific answer is "you're already booked", not "full" —
    # otherwise a user re-submitting their own booking on a capacity-1
    # session would be told it's full rather than that they're already in.
    if Booking.objects.filter(
        user=user, session=session, status=Booking.Status.ACTIVE
    ).exists():
        raise DuplicateBookingError

    active_count = session.bookings.filter(status=Booking.Status.ACTIVE).count()
    if active_count >= session.capacity:
        raise SessionFullError

    try:
        with transaction.atomic():
            booking = Booking.objects.create(user=user, session=session, status=Booking.Status.ACTIVE)
    except IntegrityError:
        # Belt-and-braces: the unique constraint catching a duplicate that
        # slipped past the check above (e.g. a stale row read).
        raise DuplicateBookingError

    return booking


@transaction.atomic
def cancel_booking(*, user, booking_id: int) -> Booking:
    booking = Booking.objects.select_for_update().select_related("session").get(pk=booking_id, user=user)
    if booking.status == Booking.Status.ACTIVE:
        if booking.session.start_time <= timezone.now():
            raise SessionAlreadyStartedError
        booking.status = Booking.Status.CANCELLED
        booking.cancelled_at = timezone.now()
        booking.save(update_fields=["status", "cancelled_at"])
    return booking
