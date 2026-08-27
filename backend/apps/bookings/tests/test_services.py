from datetime import timedelta

import pytest
from django.utils import timezone

from apps.bookings import services
from apps.bookings.models import Booking


@pytest.mark.django_db
def test_create_booking_succeeds_when_seats_available(plain_user, make_session):
    session = make_session(capacity=2)
    booking = services.create_booking(user=plain_user, session_id=session.id)
    assert booking.status == Booking.Status.ACTIVE
    assert booking.user == plain_user


@pytest.mark.django_db
def test_create_booking_rejects_duplicate_active_booking(plain_user, make_session):
    session = make_session(capacity=5)
    services.create_booking(user=plain_user, session_id=session.id)
    with pytest.raises(services.DuplicateBookingError):
        services.create_booking(user=plain_user, session_id=session.id)
    assert Booking.objects.filter(session=session, user=plain_user, status=Booking.Status.ACTIVE).count() == 1


@pytest.mark.django_db
def test_create_booking_allows_rebooking_after_cancellation(plain_user, make_session):
    session = make_session(capacity=5)
    booking = services.create_booking(user=plain_user, session_id=session.id)
    services.cancel_booking(user=plain_user, booking_id=booking.id)
    second = services.create_booking(user=plain_user, session_id=session.id)
    assert second.status == Booking.Status.ACTIVE


@pytest.mark.django_db
def test_create_booking_rejects_when_session_full(plain_user, make_user, make_session):
    session = make_session(capacity=1)
    services.create_booking(user=plain_user, session_id=session.id)
    other_user = make_user("secondbooker")
    with pytest.raises(services.SessionFullError):
        services.create_booking(user=other_user, session_id=session.id)
    assert Booking.objects.filter(session=session, status=Booking.Status.ACTIVE).count() == 1


@pytest.mark.django_db
def test_create_booking_rejects_already_started_session(plain_user, creator):
    from apps.catalog.models import Session

    session = Session.objects.create(
        creator=creator,
        title="Already started",
        start_time=timezone.now() - timedelta(minutes=5),
        duration_minutes=30,
        capacity=5,
    )
    with pytest.raises(services.SessionAlreadyStartedError):
        services.create_booking(user=plain_user, session_id=session.id)


@pytest.mark.django_db
def test_cancel_booking_frees_a_seat_for_someone_else(plain_user, make_user, make_session):
    session = make_session(capacity=1)
    booking = services.create_booking(user=plain_user, session_id=session.id)
    services.cancel_booking(user=plain_user, booking_id=booking.id)

    other_user = make_user("waitlisted")
    new_booking = services.create_booking(user=other_user, session_id=session.id)
    assert new_booking.status == Booking.Status.ACTIVE
    assert Booking.objects.filter(session=session, status=Booking.Status.ACTIVE).count() == 1
