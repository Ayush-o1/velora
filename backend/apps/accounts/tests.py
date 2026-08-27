from datetime import timedelta

import pytest
from rest_framework_simplejwt.tokens import AccessToken


def auth_header(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.mark.django_db
def test_me_requires_authentication(api_client):
    response = api_client.get("/api/auth/me/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_invalid_token_is_rejected(api_client):
    response = api_client.get("/api/auth/me/", **auth_header("this.is.not-a-valid-jwt"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] in ("token_not_valid", "not_authenticated")


@pytest.mark.django_db
def test_expired_token_is_rejected(api_client, plain_user):
    # `AccessToken.lifetime` is bound as a class attribute from api_settings
    # at import time, so overriding the SIMPLE_JWT setting at test-run time
    # does NOT change how long a freshly-issued token lives (this bit us —
    # see PROMPT_LOG.md). `set_exp()` sets the claim on this token instance
    # directly, which is the documented way to mint an already-expired token.
    token = AccessToken.for_user(plain_user)
    token.set_exp(lifetime=timedelta(seconds=-1))
    response = api_client.get("/api/auth/me/", **auth_header(str(token)))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_not_valid"


@pytest.mark.django_db
def test_valid_token_grants_access(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.get("/api/auth/me/", **auth_header(str(token)))
    assert response.status_code == 200
    assert response.json()["username"] == plain_user.username


@pytest.mark.django_db
def test_user_can_update_own_profile(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.patch(
        "/api/auth/me/",
        {"first_name": "Ada", "bio": "Booking enthusiast."},
        format="json",
        **auth_header(str(token)),
    )
    assert response.status_code == 200
    assert response.json()["first_name"] == "Ada"
    assert response.json()["bio"] == "Booking enthusiast."


@pytest.mark.django_db
def test_user_can_become_a_creator_via_profile_update(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.patch(
        "/api/auth/me/", {"role": "creator"}, format="json", **auth_header(str(token))
    )
    assert response.status_code == 200
    assert response.json()["role"] == "creator"


@pytest.mark.django_db
def test_invalid_role_value_is_rejected(api_client, plain_user):
    token = AccessToken.for_user(plain_user)
    response = api_client.patch(
        "/api/auth/me/", {"role": "admin"}, format="json", **auth_header(str(token))
    )
    assert response.status_code == 400
