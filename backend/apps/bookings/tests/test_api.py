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
