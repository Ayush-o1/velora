from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsCreator(BasePermission):
    """Grants access only to authenticated users with role == creator."""

    message = "This action is restricted to creator accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_creator
        )


class IsSessionOwnerOrReadOnly(BasePermission):
    """
    Anyone can read (list/retrieve). Only the creator who owns the
    session may update or delete it. This is an OBJECT-level check,
    evaluated after `has_permission`, so it runs even when a caller
    crafts a request for someone else's session id.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_creator)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return obj.creator_id == request.user.id
