from rest_framework.permissions import BasePermission


class IsSuperUser(BasePermission):
    """Allows access to superuser accounts only.

    Gates the in-app admin API (user list, saved-search history, export,
    clear-data). Regular staff accounts do NOT get this - only
    is_superuser does, so plain staff can't see other users' data.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class IsAdminOrLead(BasePermission):
    """Allows superusers and explicitly promoted Lead accounts.

    Lead accounts can perform the same operational admin tasks (user data,
    exports, recovery) but never receive the audit-log API.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or getattr(user, "role", None) == "lead")
        )
