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
