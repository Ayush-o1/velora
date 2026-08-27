"""
Uniform error envelope for the API: every error response looks like
    {"error": {"code": "some_code", "detail": "human readable message"}}
so the frontend can branch on `code` instead of parsing prose.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.views import exception_handler


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

    if isinstance(detail, dict) and "detail" in detail and len(detail) == 1:
        message = detail["detail"]
    else:
        message = detail

    response.data = {"error": {"code": code, "detail": message}}
    return response
