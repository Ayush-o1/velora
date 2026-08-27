"""
Uniform error envelope for the API: every error response looks like
    {"error": {"code": "some_code", "detail": "human readable message"}}
so the frontend can branch on `code` instead of parsing prose.
"""

from rest_framework.views import exception_handler


def velora_exception_handler(exc, context):
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
