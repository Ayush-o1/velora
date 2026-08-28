from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken


def auth_header(user):
    token = AccessToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.mark.django_db
def test_unauthenticated_booking_is_rejected(api_client, make_session):
    session = make_session()
    response = api_client.post("/api/bookings/", {"session": session.id}, format="json")
    assert response.status_code == 401


@pytest.mark.django_db
def test_book_session_success(api_client, plain_user, make_session):
    session = make_session(capacity=3)
    response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user)
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "active"
    assert body["session"]["id"] == session.id


@pytest.mark.django_db
def test_book_session_duplicate_returns_409(api_client, plain_user, make_session):
    session = make_session(capacity=5)
    api_client.post("/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user))
    response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user)
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duplicate_booking"


@pytest.mark.django_db
def test_rebooking_own_only_seat_returns_duplicate_not_full(api_client, plain_user, make_session):
    session = make_session(capacity=1)
    api_client.post("/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user))
    response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user)
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duplicate_booking"


@pytest.mark.django_db
def test_book_full_session_returns_409(api_client, plain_user, make_user, make_session):
    session = make_session(capacity=1)
    api_client.post("/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user))

    second_user = make_user("latecomer")
    response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(second_user)
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "session_full"


@pytest.mark.django_db
def test_book_started_session_returns_400(api_client, plain_user, creator):
    from apps.catalog.models import Session

    session = Session.objects.create(
        creator=creator,
        title="In progress",
        start_time=timezone.now() - timedelta(minutes=1),
        duration_minutes=30,
        capacity=5,
    )
    response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user)
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "session_already_started"


@pytest.mark.django_db
def test_book_nonexistent_session_returns_404(api_client, plain_user):
    response = api_client.post("/api/bookings/", {"session": 999999}, format="json", **auth_header(plain_user))
    assert response.status_code == 404


@pytest.mark.django_db
def test_me_bookings_lists_only_own_bookings(api_client, plain_user, make_user, make_session):
    session = make_session(capacity=5)
    api_client.post("/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user))

    other_user = make_user("someoneelse")
    response = api_client.get("/api/bookings/me/", **auth_header(other_user))
    assert response.status_code == 200
    assert response.json()["count"] == 0

    response = api_client.get("/api/bookings/me/", **auth_header(plain_user))
    assert response.json()["count"] == 1


@pytest.mark.django_db
def test_cancel_booking_frees_seat(api_client, plain_user, make_session):
    session = make_session(capacity=1)
    create_response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user)
    )
    booking_id = create_response.json()["id"]

    cancel_response = api_client.delete(f"/api/bookings/{booking_id}/", **auth_header(plain_user))
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"

    from apps.bookings.models import Booking

    assert Booking.objects.filter(session=session, status=Booking.Status.ACTIVE).count() == 0


@pytest.mark.django_db
def test_cancel_started_session_booking_returns_400(api_client, plain_user, creator):
    from apps.catalog.models import Session
    from apps.bookings.models import Booking

    session = Session.objects.create(
        creator=creator,
        title="Already underway",
        start_time=timezone.now() - timedelta(minutes=1),
        duration_minutes=30,
        capacity=5,
    )
    booking = Booking.objects.create(user=plain_user, session=session, status=Booking.Status.ACTIVE)

    response = api_client.delete(f"/api/bookings/{booking.id}/", **auth_header(plain_user))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "session_already_started"

    booking.refresh_from_db()
    assert booking.status == Booking.Status.ACTIVE


@pytest.mark.django_db
def test_cannot_cancel_another_users_booking(api_client, plain_user, make_user, make_session):
    session = make_session(capacity=5)
    create_response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(plain_user)
    )
    booking_id = create_response.json()["id"]

    other_user = make_user("nosybystander")
    response = api_client.delete(f"/api/bookings/{booking_id}/", **auth_header(other_user))
    assert response.status_code == 404

    from apps.bookings.models import Booking

    assert Booking.objects.get(id=booking_id).status == Booking.Status.ACTIVE


# --- Audit-pass hardening ------------------------------------------------


@pytest.mark.django_db
def test_malformed_booking_id_returns_404_not_500(api_client, plain_user):
    """
    The router's lookup regex accepts any non-slash segment, so a
    non-numeric id reached the ORM and raised an unhandled ValueError —
    a 500 on plainly malformed input. An id that *cannot* exist should
    get the same 404 as an id that simply doesn't.
    """
    response = api_client.delete("/api/bookings/abc/", **auth_header(plain_user))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "booking_not_found"


@pytest.mark.django_db
def test_creator_cannot_book_their_own_session(api_client, creator, make_session):
    """
    The session page tells a creator "this is your own session", but that
    notice is not a security boundary — a direct POST bypassed it and the
    host silently consumed one of their own seats.
    """
    session = make_session(owner=creator, capacity=1)
    response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(creator)
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "cannot_book_own_session"

    from apps.bookings.models import Booking

    assert Booking.objects.filter(session=session).count() == 0


@pytest.mark.django_db
def test_another_creator_can_still_book_someone_elses_session(
    api_client, creator, other_creator, make_session
):
    """Being a creator is not itself disqualifying — only being *this*
    session's host is."""
    session = make_session(owner=creator, capacity=2)
    response = api_client.post(
        "/api/bookings/", {"session": session.id}, format="json", **auth_header(other_creator)
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_booking_payload_cannot_assign_another_user_or_a_forced_status(
    api_client, plain_user, make_user, make_session
):
    """Mass-assignment probe: only `session` is read off the request body."""
    from apps.bookings.models import Booking

    session = make_session(capacity=5)
    victim = make_user("victimuser")
    response = api_client.post(
        "/api/bookings/",
        {"session": session.id, "user": victim.id, "status": "cancelled", "id": 4242},
        format="json",
        **auth_header(plain_user),
    )
    assert response.status_code == 201
    booking = Booking.objects.get(session=session)
    assert booking.user == plain_user
    assert booking.status == Booking.Status.ACTIVE
    assert booking.id != 4242


@pytest.mark.django_db
def test_my_bookings_are_ordered_by_when_the_session_happens(
    api_client, plain_user, creator, make_session
):
    """
    The model's default ordering is -created_at, so a list of upcoming
    commitments came back in the order they were booked — putting next
    week ahead of tomorrow. Ordered by session start instead.
    """
    from apps.bookings.models import Booking

    far = make_session(owner=creator, starts_in_hours=200, title="Far")
    near = make_session(owner=creator, starts_in_hours=5, title="Near")
    middle = make_session(owner=creator, starts_in_hours=60, title="Middle")
    for session in (far, near, middle):  # deliberately not chronological
        Booking.objects.create(user=plain_user, session=session)

    response = api_client.get("/api/bookings/me/?scope=active", **auth_header(plain_user))
    titles = [b["session"]["title"] for b in response.json()["results"]]
    assert titles == ["Near", "Middle", "Far"]
