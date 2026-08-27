import pytest


@pytest.mark.django_db
def test_generic_404_uses_not_found_code_not_leaked_class_name(api_client):
    """
    Regression test: DRF's own exception_handler converts a raw Django
    Http404 (raised internally by generic views' get_object()) into its
    typed NotFound exception, but only on a local variable — it never
    exposes that conversion to a wrapping exception handler. Without
    mirroring the conversion ourselves, `getattr(exc, "default_code", ...)`
    fell through to `exc.__class__.__name__.lower()` and leaked the
    literal Python class name "http404" as the error code, defeating the
    whole point of the uniform envelope (branch on `code`, not prose).
    """
    response = api_client.get("/api/sessions/999999999/")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.django_db
def test_validation_errors_are_flattened_into_a_readable_sentence(api_client, creator):
    """
    DRF returns field errors as a nested object. The envelope used to pass
    that straight through as `detail`, so the frontend — which renders
    `detail` as the message — could only show the user a literal
    `{"capacity":["..."]}` blob. `detail` is now a sentence; the
    structure survives alongside it under `fields` for form binding.
    """
    from rest_framework_simplejwt.tokens import AccessToken

    header = {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(creator)}"}
    response = api_client.post(
        "/api/sessions/",
        {"title": "", "start_time": "not-a-date", "duration_minutes": 0, "capacity": 0},
        format="json",
        **header,
    )
    assert response.status_code == 400
    error = response.json()["error"]
    assert isinstance(error["detail"], str)
    assert "{" not in error["detail"]
    assert set(error["fields"]) >= {"title", "start_time", "capacity"}


@pytest.mark.django_db
def test_unknown_api_path_returns_json_not_html(api_client):
    """
    An unmatched /api/ route fell through to Django's own 404 handler,
    which answers an API client with an HTML error page — breaking the
    envelope every other endpoint honours.
    """
    response = api_client.get("/api/no-such-endpoint/")
    assert response.status_code == 404
    assert response["Content-Type"].startswith("application/json")
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.django_db
def test_health_endpoint_reports_ok(api_client):
    response = api_client.get("/api/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
