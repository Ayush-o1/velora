"""
Uniform error envelope for the API: every error response looks like

    {"error": {"code": "some_code", "detail": "human readable message"}}

so the frontend can branch on `code` instead of parsing prose. Field
validation errors additionally carry a `fields` map, for forms that want
to attach messages to individual inputs.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.views import exception_handler

NON_FIELD = "non_field_errors"


def _messages(value) -> list[str]:
    """Flatten DRF's arbitrarily nested detail structure into flat strings."""
    if isinstance(value, dict):
        return [m for v in value.values() for m in _messages(v)]
    if isinstance(value, (list, tuple)):
        return [m for v in value for m in _messages(v)]
    return [str(value)]


def _humanize(field: str) -> str:
    return field.replace("_", " ").capitalize()


def _flatten_field_errors(detail: dict) -> tuple[str, dict[str, list[str]]]:
    """
    Turn {"capacity": ["Must be at least 1."]} into a sentence a human can
    read plus a machine-readable per-field map.

    Without this, the envelope's `detail` was a nested object, which the
    frontend could only surface by JSON-stringifying it — so a form
    validation failure showed the user a literal `{"capacity":["..."]}`
    blob instead of a sentence.
    """
    fields = {str(k): _messages(v) for k, v in detail.items()}
    parts = []
    for name, msgs in fields.items():
        joined = " ".join(msgs)
        parts.append(joined if name == NON_FIELD else f"{_humanize(name)}: {joined}")
    return " ".join(parts), fields


def velora_exception_handler(exc, context):
    # DRF's own exception_handler converts a raw Http404/Django
    # PermissionDenied into its typed NotFound/PermissionDenied
    # internally, but only on its own local variable — it never hands
    # that converted exception back to us. Without doing the same
    # conversion here, `exc` below is still the untyped Http404, which
    # has no `default_code`, so the fallback leaked the Python class
    # name itself ("http404") as the error code instead of "not_found".
    if isinstance(exc, Http404):
        exc = exceptions.NotFound(*(exc.args))
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied(*(exc.args))

    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    code = getattr(exc, "default_code", exc.__class__.__name__.lower())
    error: dict = {"code": code}

    if isinstance(detail, dict) and set(detail) == {"detail"}:
        error["detail"] = detail["detail"]
    elif isinstance(detail, dict):
        error["detail"], error["fields"] = _flatten_field_errors(detail)
    else:
        error["detail"] = " ".join(_messages(detail))

    response.data = {"error": error}
    return response
