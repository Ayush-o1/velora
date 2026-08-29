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


# --- Validation hardening (found during the final audit pass) ------------


@pytest.mark.django_db
def test_session_cannot_be_created_in_the_past(api_client, creator):
    """
    A session whose start_time has already passed can never be booked
    (`create_booking` rejects started sessions), so allowing one to be
    published just puts unbookable dead stock in the public catalog.
    """
    payload = {
        "title": "Yesterday's session",
        "description": "",
        "location": "Online",
        "start_time": (timezone.now() - timedelta(days=1)).isoformat(),
        "duration_minutes": 30,
        "capacity": 5,
    }
    response = api_client.post("/api/sessions/", payload, format="json", **auth_header(creator))
    assert response.status_code == 400
    assert "start_time" in response.json()["error"]["fields"]


@pytest.mark.django_db
def test_session_cannot_be_moved_into_the_past(api_client, creator, make_session):
    session = make_session(owner=creator)
    response = api_client.patch(
        f"/api/sessions/{session.id}/",
        {"start_time": (timezone.now() - timedelta(hours=2)).isoformat()},
        format="json",
        **auth_header(creator),
    )
    assert response.status_code == 400
    session.refresh_from_db()
    assert session.start_time > timezone.now()


@pytest.mark.django_db
def test_started_session_can_still_have_other_fields_edited(api_client, creator):
    """
    The future-start_time rule must only fire when start_time actually
    changes — otherwise a full PUT (which re-sends the unchanged
    timestamp) would make an in-progress session permanently uneditable.
    """
    from apps.catalog.models import Session

    session = Session.objects.create(
        creator=creator,
        title="Underway",
        start_time=timezone.now() - timedelta(minutes=10),
        duration_minutes=60,
        capacity=5,
    )
    response = api_client.put(
        f"/api/sessions/{session.id}/",
        {
            "title": "Underway (updated notes)",
            "description": "Joining link in the description.",
            "location": "Online",
            "start_time": session.start_time.isoformat(),
            "duration_minutes": 60,
            "capacity": 5,
        },
        format="json",
        **auth_header(creator),
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Underway (updated notes)"


@pytest.mark.django_db
def test_capacity_cannot_be_lowered_below_active_bookings(
    api_client, creator, plain_user, make_user, make_session
):
    """
    The headline invariant is "active bookings never exceed capacity".
    Booking enforces it on the way in, but nothing stopped a creator from
    breaking it from the other direction by shrinking capacity underneath
    people who had already booked.
    """
    from apps.bookings.models import Booking

    session = make_session(owner=creator, capacity=5)
    Booking.objects.create(user=plain_user, session=session)
    Booking.objects.create(user=make_user("secondattendee"), session=session)

    response = api_client.patch(
        f"/api/sessions/{session.id}/", {"capacity": 1}, format="json", **auth_header(creator)
    )
    assert response.status_code == 400
    assert "capacity" in response.json()["error"]["fields"]
    session.refresh_from_db()
    assert session.capacity == 5


@pytest.mark.django_db
def test_capacity_can_be_raised_or_lowered_to_exactly_the_booking_count(
    api_client, creator, plain_user, make_session
):
    from apps.bookings.models import Booking

    session = make_session(owner=creator, capacity=5)
    Booking.objects.create(user=plain_user, session=session)

    raised = api_client.patch(
        f"/api/sessions/{session.id}/", {"capacity": 50}, format="json", **auth_header(creator)
    )
    assert raised.status_code == 200

    trimmed = api_client.patch(
        f"/api/sessions/{session.id}/", {"capacity": 1}, format="json", **auth_header(creator)
    )
    assert trimmed.status_code == 200
    assert trimmed.json()["seats_remaining"] == 0


@pytest.mark.django_db
def test_cancelled_bookings_do_not_block_lowering_capacity(
    api_client, creator, plain_user, make_session
):
    from apps.bookings.models import Booking

    session = make_session(owner=creator, capacity=5)
    Booking.objects.create(user=plain_user, session=session, status=Booking.Status.CANCELLED)

    response = api_client.patch(
        f"/api/sessions/{session.id}/", {"capacity": 1}, format="json", **auth_header(creator)
    )
    assert response.status_code == 200


# --- Viewer state + search ----------------------------------------------


@pytest.mark.django_db
def test_viewer_has_booked_reflects_the_requesting_user_only(
    api_client, plain_user, make_user, make_session
):
    from apps.bookings.models import Booking

    session = make_session(capacity=5)
    Booking.objects.create(user=plain_user, session=session)

    booked = api_client.get(f"/api/sessions/{session.id}/", **auth_header(plain_user))
    assert booked.json()["viewer_has_booked"] is True

    stranger = api_client.get(f"/api/sessions/{session.id}/", **auth_header(make_user("stranger")))
    assert stranger.json()["viewer_has_booked"] is False

    anonymous = api_client.get(f"/api/sessions/{session.id}/")
    assert anonymous.json()["viewer_has_booked"] is False


@pytest.mark.django_db
def test_cancelled_booking_does_not_count_as_viewer_booked(api_client, plain_user, make_session):
    from apps.bookings.models import Booking

    session = make_session(capacity=5)
    Booking.objects.create(user=plain_user, session=session, status=Booking.Status.CANCELLED)
    response = api_client.get(f"/api/sessions/{session.id}/", **auth_header(plain_user))
    assert response.json()["viewer_has_booked"] is False


@pytest.mark.django_db
def test_catalog_search_matches_title_description_location_and_host(
    api_client, creator, make_session
):
    make_session(owner=creator, title="PostgreSQL Performance Fundamentals", location="Online")
    make_session(owner=creator, title="Modern React Architecture", location="Berlin")

    by_title = api_client.get("/api/sessions/?search=postgres")
    assert [s["title"] for s in by_title.json()["results"]] == ["PostgreSQL Performance Fundamentals"]

    by_location = api_client.get("/api/sessions/?search=berlin")
    assert [s["title"] for s in by_location.json()["results"]] == ["Modern React Architecture"]

    by_host = api_client.get(f"/api/sessions/?search={creator.username}")
    assert by_host.json()["count"] == 2

    no_match = api_client.get("/api/sessions/?search=zzzznothing")
    assert no_match.json()["count"] == 0


@pytest.mark.django_db
def test_catalog_can_be_filtered_by_creator(api_client, creator, other_creator, make_session):
    make_session(owner=creator, title="Hosted by first creator")
    make_session(owner=other_creator, title="Hosted by second creator")

    filtered = api_client.get(f"/api/sessions/?creator={creator.id}")
    assert [s["title"] for s in filtered.json()["results"]] == ["Hosted by first creator"]

    no_match = api_client.get("/api/sessions/?creator=999999")
    assert no_match.json()["count"] == 0
