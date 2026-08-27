from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import IsSessionOwnerOrReadOnly

from .models import Session
from .serializers import SessionSerializer, SessionWriteSerializer


class SessionViewSet(viewsets.ModelViewSet):
    """
    Public read access (list/retrieve). Writes (create/update/delete) are
    restricted to authenticated creators, and update/delete are further
    restricted to the session's own creator by `IsSessionOwnerOrReadOnly`'s
    object-level check — enforced server-side regardless of what the
    frontend shows or hides.
    """

    permission_classes = [IsSessionOwnerOrReadOnly]
    filterset_fields = []

    def get_queryset(self):
        qs = Session.objects.select_related("creator").annotate(
            active_booking_count=Count("bookings", filter=Q(bookings__status="active"))
        ).order_by("start_time")
        if self.action == "list" and self.request.query_params.get("upcoming") == "true":
            from django.utils import timezone

            qs = qs.filter(start_time__gt=timezone.now())
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return SessionWriteSerializer
        return SessionSerializer

    def perform_create(self, serializer):
        serializer.save(creator=self.request.user)

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        self.perform_create(write_serializer)
        instance = self.get_queryset().get(pk=write_serializer.instance.pk)
        headers = self.get_success_headers(write_serializer.data)
        return Response(SessionSerializer(instance).data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        session = self.get_object()
        write_serializer = self.get_serializer(session, data=request.data, partial=partial)
        write_serializer.is_valid(raise_exception=True)
        write_serializer.save()
        instance = self.get_queryset().get(pk=session.pk)
        return Response(SessionSerializer(instance).data)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def mine(self, request):
        qs = self.get_queryset().filter(creator=request.user)
        page = self.paginate_queryset(qs)
        serializer = SessionSerializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
