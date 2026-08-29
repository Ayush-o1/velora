from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
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

    def get_queryset(self):
        from apps.bookings.models import Booking

        qs = Session.objects.select_related("creator").annotate(
            active_booking_count=Count("bookings", filter=Q(bookings__status=Booking.Status.ACTIVE))
        )

        # One `EXISTS` subquery instead of a per-row lookup, so the catalog
        # can tell each signed-in viewer "you're already booked" without
        # turning a 20-item page into 21 queries.
        user = self.request.user
        if user.is_authenticated:
            qs = qs.annotate(
                viewer_active_booking=Exists(
                    Booking.objects.filter(
                        session=OuterRef("pk"), user=user, status=Booking.Status.ACTIVE
                    )
                )
            )

        if self.action == "list":
            search = (self.request.query_params.get("search") or "").strip()
            if search:
                qs = qs.filter(
                    Q(title__icontains=search)
                    | Q(description__icontains=search)
                    | Q(location__icontains=search)
                    | Q(creator__username__icontains=search)
                )
            if self.request.query_params.get("upcoming") == "true":
                qs = qs.filter(start_time__gt=timezone.now())
            creator_id = self.request.query_params.get("creator")
            if creator_id:
                qs = qs.filter(creator_id=creator_id)

        return qs.order_by("start_time")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return SessionWriteSerializer
        return SessionSerializer

    def perform_create(self, serializer):
        serializer.save(creator=self.request.user)

    def _read_serializer(self, pk):
        """Re-read through the annotated queryset so a write response carries
        the same computed fields (seat counts, viewer state) as a read."""
        return SessionSerializer(self.get_queryset().get(pk=pk), context=self.get_serializer_context())

    def create(self, request, *args, **kwargs):
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        self.perform_create(write_serializer)
        headers = self.get_success_headers(write_serializer.data)
        return Response(
            self._read_serializer(write_serializer.instance.pk).data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        session = self.get_object()
        write_serializer = self.get_serializer(session, data=request.data, partial=partial)
        write_serializer.is_valid(raise_exception=True)
        write_serializer.save()
        return Response(self._read_serializer(session.pk).data)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def mine(self, request):
        qs = self.get_queryset().filter(creator=request.user)
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(qs, many=True).data)
