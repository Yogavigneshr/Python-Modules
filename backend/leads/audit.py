from .models import ActivityLog


def log_activity(*, user=None, actor=None, action, details=None, user_email=None):
    """Persist an activity event without exposing admin identity values.

    Admin identity is deliberately omitted from audit records. Actions that
    target a regular user still retain the target user's activity context,
    while the admin actor/email is never persisted.
    """
    try:
        if actor is not None and getattr(actor, "is_superuser", False):
            # Admin identity values are never persisted. Export events may still
            # be recorded without an actor so the Export History can show that
            # an export happened, while ordinary admin login/logout events are
            # omitted entirely.
            if user is None or user == actor:
                if action != "export_requested":
                    return None
                actor = None
                user_email = ""
            else:
                actor = None
                user_email = user_email or getattr(user, "email", "")

        if user is not None and getattr(user, "is_superuser", False):
            user = None
            user_email = ""

        ActivityLog.objects.create(
            user=user,
            user_email=user_email or getattr(user, "email", "") or getattr(actor, "email", ""),
            actor=actor,
            action=action,
            details=details or {},
        )
    except Exception:
        return None
    return True
