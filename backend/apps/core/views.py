from django.db import connection
from django.http import JsonResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # Round-trips a real query rather than just returning 200: this is
        # what the Compose healthcheck polls, so "healthy" should mean the
        # API can reach its database, not merely that a process is up.
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return Response({"status": "ok"})


def api_not_found(request, *args, **kwargs):
    """
    Catch-all for unmatched `/api/...` paths. Without it, an unknown API
    route fell through to Django's own 404 handler and answered an API
    client with an HTML error page, breaking the envelope every other
    endpoint honours. A plain Django view rather than an APIView: there is
    no content negotiation to do — the answer is always this JSON.
    """
    return JsonResponse(
        {"error": {"code": "not_found", "detail": "No API endpoint matches this path."}},
        status=status.HTTP_404_NOT_FOUND,
    )
