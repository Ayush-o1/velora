from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken


def auth_header(user):
    token = AccessToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.mark.django_db
def test_anyone_can_list_sessions_without_auth(api_client, make_session):
    make_session()
    response = api_client.get("/api/sessions/")
    assert response.status_code == 200
    assert response.json()["count"] == 1


@pytest.mark.django_db
def test_anyone_can_view_session_detail_without_auth(api_client, make_session):
    session = make_session()
    response = api_client.get(f"/api/sessions/{session.id}/")
    assert response.status_code == 200
    assert response.json()["title"] == session.title


@pytest.mark.django_db
def test_plain_user_cannot_create_session(api_client, plain_user):
    payload = {
        "title": "Unauthorized Session",
        "description": "",
        "location": "Online",
        "start_time": (timezone.now() + timedelta(days=1)).isoformat(),
        "duration_minutes": 30,
        "capacity": 5,
    }
    response = api_client.post("/api/sessions/", payload, format="json", **auth_header(plain_user))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


@pytest.mark.django_db
def test_unauthenticated_user_cannot_create_session(api_client):
    response = api_client.post("/api/sessions/", {}, format="json")
    assert response.status_code == 401


@pytest.mark.django_db
def test_creator_can_create_session(api_client, creator):
    payload = {
        "title": "Intro to Backend Engineering",
        "description": "Live workshop.",
        "location": "Online",
        "start_time": (timezone.now() + timedelta(days=1)).isoformat(),
        "duration_minutes": 60,
        "capacity": 10,
    }
    response = api_client.post("/api/sessions/", payload, format="json", **auth_header(creator))
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == payload["title"]
    assert body["creator"]["id"] == creator.id
    assert body["seats_remaining"] == 10


@pytest.mark.django_db
def test_creator_cannot_edit_another_creators_session(api_client, creator, other_creator, make_session):
    session = make_session(owner=creator)
    response = api_client.patch(
        f"/api/sessions/{session.id}/",
        {"title": "Hijacked title"},
        format="json",
        **auth_header(other_creator),
    )
    assert response.status_code == 403
    session.refresh_from_db()
    assert session.title != "Hijacked title"


@pytest.mark.django_db
def test_creator_cannot_delete_another_creators_session(api_client, creator, other_creator, make_session):
    session = make_session(owner=creator)
    response = api_client.delete(f"/api/sessions/{session.id}/", **auth_header(other_creator))
    assert response.status_code == 403
    from apps.catalog.models import Session

    assert Session.objects.filter(id=session.id).exists()


@pytest.mark.django_db
def test_creator_can_edit_own_session(api_client, creator, make_session):
    session = make_session(owner=creator)
    response = api_client.patch(
        f"/api/sessions/{session.id}/", {"title": "Updated title"}, format="json", **auth_header(creator)
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Updated title"


@pytest.mark.django_db
def test_creator_can_delete_own_session(api_client, creator, make_session):
    session = make_session(owner=creator)
    response = api_client.delete(f"/api/sessions/{session.id}/", **auth_header(creator))
    assert response.status_code == 204


@pytest.mark.django_db
def test_mine_endpoint_returns_only_own_sessions_with_booking_counts(
    api_client, creator, other_creator, make_session, plain_user
):
    from apps.bookings.models import Booking

    own_session = make_session(owner=creator, capacity=2)
    make_session(owner=other_creator)
    Booking.objects.create(user=plain_user, session=own_session, status=Booking.Status.ACTIVE)

    response = api_client.get("/api/sessions/mine/", **auth_header(creator))
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["id"] == own_session.id
    assert results[0]["seats_taken"] == 1
    assert results[0]["seats_remaining"] == 1
