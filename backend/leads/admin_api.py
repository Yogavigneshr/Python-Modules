"""Admin panel API.

Gated by IsSuperUser throughout - superuser accounts only get an in-app
view of every user's saved search history (the frontend's /admin route),
separate from the Django admin site at /admin/ on the backend itself.
Plain staff accounts do not get access. Everything here is read/export
only, with one deliberate exception: AdminClearDataView, which lets a
superuser wipe saved data.
"""

import csv
from datetime import datetime, time, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import Count, Max, Q
from django.http import HttpResponse, QueryDict
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ActivityLog, DeletedDataRecovery, Lead, Search
from .recovery import snapshot_searches, restore_payload
from .permissions import IsAdminOrLead, IsSuperUser
from .audit import log_activity
from accounts.models import PendingLeadSignup
from accounts.serializers import UserSerializer

User = get_user_model()



class AdminOverviewView(APIView):
    """GET /api/admin/overview/ - headline numbers for the admin dashboard."""

    permission_classes = [IsAdminOrLead]

    def get(self, request):
        now = timezone.now()
        last_7_days = now - timedelta(days=7)
        last_24_hours = now - timedelta(hours=24)

        visible_searches = Search.objects.filter(user__is_superuser=False, user__is_active=True, user__role__in=[User.Role.USER, User.Role.LEAD])
        recent_searches = (
            visible_searches.select_related("user")
            .order_by("-created_at")[:10]
        )

        return Response(
            {
                "totalUsers": User.objects.filter(is_superuser=False, is_active=True, role__in=[User.Role.USER, User.Role.LEAD]).count(),
                "totalSearches": visible_searches.count(),
                "totalLeads": Lead.objects.filter(search__user__is_superuser=False, search__user__is_active=True, search__user__role__in=[User.Role.USER, User.Role.LEAD]).count(),
                "searchesLast24h": visible_searches.filter(created_at__gte=last_24_hours).count(),
                "searchesLast7Days": visible_searches.filter(created_at__gte=last_7_days).count(),
                "newUsersLast7Days": User.objects.filter(is_superuser=False, is_active=True, role__in=[User.Role.USER, User.Role.LEAD], created_at__gte=last_7_days).count(),
                "recentSearches": [
                    {
                        "id": str(s.id),
                        "category": s.category,
                        "location": s.location,
                        "scanned": s.scanned,
                        "createdAt": s.created_at.isoformat(),
                        "userEmail": s.created_by_email or (s.user.email if s.user_id else ""),
                    }
                    for s in recent_searches
                ],
            }
        )


class AdminRecentSearchesView(APIView):
    permission_classes = [IsAdminOrLead]

    def get(self, request):
        searches = (
            Search.objects.filter(user__is_superuser=False, user__is_active=True, user__role__in=[User.Role.USER, User.Role.LEAD])
            .select_related("user")
            .annotate(lead_count=Count("leads"))
            .order_by("-created_at")[:500]
        )
        return Response({
            "searches": [
                {
                    "id": str(s.id),
                    "userId": str(s.user_id),
                    "userEmail": s.created_by_email or (s.user.email if s.user_id else ""),
                    "category": s.category,
                    "location": s.location,
                    "scanned": s.scanned,
                    "leadCount": s.lead_count,
                    "createdAt": s.created_at.isoformat(),
                }
                for s in searches
            ]
        })


class AdminUsersView(APIView):
    """GET /api/admin/users/ - every user, with search/lead counts and
    last-active timestamp, so the admin panel can list & sort by activity.
    """

    permission_classes = [IsAdminOrLead]

    def get(self, request):
        users = (
            User.objects.filter(is_superuser=False, is_active=True, role__in=[User.Role.USER, User.Role.LEAD])
            .annotate(
                search_count=Count("searches", distinct=True),
                lead_count=Count("searches__leads", distinct=True),
                last_search_at=Max("searches__created_at"),
            )
            .order_by("-created_at")
        )

        return Response(
            {
                "users": [
                    {
                        "id": str(u.id),
                        "email": u.email,
                        "isStaff": u.is_staff,
                        "isSuperuser": u.is_superuser,
                        "role": "admin" if u.is_superuser else u.role,
                        "isActive": u.is_active,
                        "createdAt": u.created_at.isoformat(),
                        "searchCount": u.search_count,
                        "leadCount": u.lead_count,
                        "lastSearchAt": u.last_search_at.isoformat() if u.last_search_at else None,
                    }
                    for u in users
                ],
            }
        )


class AdminCreateUserView(APIView):
    """POST /api/admin/users/create/ - Admin/Lead provisions a new User or Lead account
    and dispatches login credentials.
    """

    permission_classes = [IsAdminOrLead]

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        full_name = str(request.data.get("fullName", "")).strip()
        role = str(request.data.get("role", "user")).strip().lower()
        password = str(request.data.get("password", "")).strip()
        send_email = bool(request.data.get("sendEmail", True))

        if not email:
            return Response({"error": "Email address is required."}, status=status.HTTP_400_BAD_REQUEST)

        if role not in {User.Role.USER, User.Role.LEAD}:
            return Response({"error": "Role must be 'user' or 'lead'."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"error": f"An account with email '{email}' already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not password:
            password = get_random_string(length=12)

        user = User.objects.create_user(
            email=email,
            password=password,
            full_name=full_name or email.split("@")[0],
            role=role,
            is_active=True,
        )

        email_sent = False
        email_error = None
        if send_email:
            try:
                subject = "Your LeadFinder Account Login Credentials"
                message = (
                    f"Hello {user.full_name},\n\n"
                    f"Your LeadFinder account has been created by your administrator.\n\n"
                    f"Account Type: {user.role.capitalize()}\n"
                    f"Email: {user.email}\n"
                    f"Password: {password}\n\n"
                    f"You can now log in at your LeadFinder login portal.\n\n"
                    f"Regards,\nLeadFinder Team"
                )
                from_email = (
                    getattr(settings, "DEFAULT_FROM_EMAIL", None)
                    or getattr(settings, "EMAIL_HOST_USER", None)
                    or "noreply@leadfinder.com"
                )
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=from_email,
                    recipient_list=[user.email],
                    fail_silently=False,
                )
                email_sent = True
            except Exception as exc:
                email_sent = False
                email_error = str(exc)

        log_activity(
            user=user,
            actor=request.user,
            action="user_created_by_admin",
            details={
                "email": user.email,
                "role": user.role,
                "emailSent": email_sent,
                "emailError": email_error,
            },
            user_email=user.email,
        )

        return Response(
            {
                "success": True,
                "user": UserSerializer(user).data,
                "password": password,
                "emailSent": email_sent,
                "emailError": email_error,
            },
            status=status.HTTP_201_CREATED,
        )




class AdminLeadRequestsView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        rows = PendingLeadSignup.objects.filter(status="pending").select_related("user").order_by("-created_at")
        return Response({
            "requests": [
                {"id": str(r.id), "userId": str(r.user_id), "email": r.user.email, "fullName": r.user.full_name, "createdAt": r.created_at.isoformat()}
                for r in rows
            ]
        })

    def post(self, request, request_id=None):
        if not request_id:
            return Response({"error": "Request id is required."}, status=400)
        try:
            signup = PendingLeadSignup.objects.select_related("user").get(id=request_id, status="pending")
        except PendingLeadSignup.DoesNotExist:
            return Response({"error": "Lead request not found."}, status=404)
        decision = request.data.get("decision")
        if decision not in {"approve", "reject"}:
            return Response({"error": "Decision must be approve or reject."}, status=400)
        now = timezone.now()
        target = signup.user
        if decision == "approve":
            target.role = User.Role.LEAD
            target.is_active = True
            target.save(update_fields=["role", "is_active"])
            signup.status = "approved"
            signup.reviewed_at = now
            signup.save(update_fields=["status", "reviewed_at"])
            log_activity(user=target, actor=request.user, action="lead_signup_approved")
            return Response({"approved": True, "email": target.email})
        signup.status = "rejected"
        signup.reviewed_at = now
        signup.save(update_fields=["status", "reviewed_at"])
        log_activity(user=target, actor=request.user, action="lead_signup_rejected")
        target.delete()
        return Response({"rejected": True, "email": target.email})


class AdminUserDeleteView(APIView):
    """Remove a regular user into the 3-day recovery bin after password confirmation.

    Destructive account operations are Admin-only; Leads are operational/read-export only.
    """
    permission_classes = [IsSuperUser]

    def delete(self, request, user_id):
        password = request.data.get("password")
        if not password:
            return Response({"error": "Admin password is required."}, status=400)
        if not request.user.check_password(password):
            return Response({"error": "Incorrect admin password."}, status=403)
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)
        if target_user.id == request.user.id:
            return Response({"error": "You cannot delete your own account."}, status=400)
        if target_user.is_superuser:
            return Response({"error": "Superuser accounts cannot be deleted from this panel."}, status=400)
        if not request.user.is_superuser and (target_user.is_staff or getattr(target_user, "role", None) == "lead"):
            return Response({"error": "Lead accounts can only remove regular users."}, status=403)

        payload = snapshot_searches(Search.objects.filter(user=target_user))
        payload["user"] = {
            "id": str(target_user.id), "email": target_user.email, "full_name": target_user.full_name,
            "password": target_user.password, "is_active": target_user.is_active,
            "is_staff": target_user.is_staff, "is_superuser": target_user.is_superuser,
            "role": "admin" if target_user.is_superuser else target_user.role,
            "created_at": target_user.created_at.isoformat(),
            "last_login": target_user.last_login.isoformat() if target_user.last_login else None,
        }
        now = timezone.now()
        recovery = DeletedDataRecovery.objects.create(
            kind="user", label=f"User removed: {target_user.email}", user_email=target_user.email,
            expires_at=now + timedelta(days=3), payload=payload,
        )
        log_activity(
            user=target_user,
            actor=request.user,
            action="user_removed",
            details={"email": target_user.email, "recoveryId": str(recovery.id)},
        )
        target_user.delete()
        return Response({"deleted": True, "email": target_user.email, "recoveryId": str(recovery.id), "expiresAt": recovery.expires_at.isoformat()})


class AdminUserSearchesView(APIView):
    """GET /api/admin/users/<user_id>/searches/ - one user's full saved
    search history (every search that user has explicitly saved)."""

    permission_classes = [IsAdminOrLead]

    def get(self, request, user_id):
        try:
            target_user = User.objects.get(id=user_id, is_superuser=False, role__in=[User.Role.USER, User.Role.LEAD])
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        searches = (
            Search.objects.filter(user=target_user)
            .annotate(lead_count=Count("leads"))
            .order_by("-created_at")
        )

        log_activity(
            user=target_user,
            actor=request.user,
            action="user_history_viewed",
            details={"searchCount": searches.count()},
        )

        return Response(
            {
                "user": {
                    "id": str(target_user.id),
                    "email": target_user.email,
                    "isStaff": target_user.is_staff,
                    "isSuperuser": target_user.is_superuser,
                    "role": "admin" if target_user.is_superuser else target_user.role,
                    "createdAt": target_user.created_at.isoformat(),
                },
                "searches": [
                    {
                        "id": str(s.id),
                        "category": s.category,
                        "location": s.location,
                        "maxResults": s.max_results,
                        "filters": s.filters,
                        "scanned": s.scanned,
                        "excluded": s.excluded,
                        "leadCount": s.lead_count,
                        "createdAt": s.created_at.isoformat(),
                        "createdByEmail": s.created_by_email,
                    }
                    for s in searches
                ],
            }
        )


class AdminClearDataView(APIView):
    """Move saved data to the 3-day recovery bin after password confirmation.

    Destructive data operations are Admin-only.
    """
    permission_classes = [IsSuperUser]

    def delete(self, request):
        if request.data.get("confirm") is not True:
            return Response({"error": "Refusing to clear data without confirm: true in the request body."}, status=400)
        password = request.data.get("password")
        if not password:
            return Response({"error": "Admin password is required."}, status=400)
        if not request.user.check_password(password):
            return Response({"error": "Incorrect admin password."}, status=403)

        user_id = request.data.get("userId")
        searches = Search.objects.all()
        label = "All saved data"
        email = ""
        if user_id:
            try:
                target_user = User.objects.get(id=user_id, is_superuser=False, role__in=[User.Role.USER, User.Role.LEAD])
            except User.DoesNotExist:
                return Response({"error": "User not found."}, status=404)
            searches = searches.filter(user=target_user)
            label = f"Data cleared: {target_user.email}"
            email = target_user.email

        payload = snapshot_searches(searches)
        deleted_searches = len(payload["searches"])
        deleted_leads = len(payload["leads"])
        now = timezone.now()
        recovery = DeletedDataRecovery.objects.create(
            kind="user_data" if user_id else "all_data", label=label, user_email=email,
            expires_at=now + timedelta(days=3), payload=payload,
        )
        log_activity(
            user=target_user if user_id else request.user,
            actor=request.user,
            action="data_cleared",
            details={
                "scope": "user" if user_id else "all",
                "targetUserId": str(target_user.id) if user_id else None,
                "targetEmail": email,
                "searchCount": deleted_searches,
                "leadCount": deleted_leads,
                "recoveryId": str(recovery.id),
            },
            user_email=email or "",
        )
        searches.delete()
        return Response({"clearedSearches": deleted_searches, "clearedLeads": deleted_leads, "scope": "user" if user_id else "all", "recoveryId": str(recovery.id), "expiresAt": recovery.expires_at.isoformat()})


class AdminRecoveryView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        DeletedDataRecovery.objects.filter(expires_at__lte=timezone.now()).delete()
        rows = DeletedDataRecovery.objects.order_by("-deleted_at")
        return Response({"items": [
            {"id": str(r.id), "kind": r.kind, "label": r.label, "userEmail": r.user_email,
             "deletedAt": r.deleted_at.isoformat(), "expiresAt": r.expires_at.isoformat(),
             "searchCount": len(r.payload.get("searches", [])), "leadCount": len(r.payload.get("leads", [])),
             "userDeleted": bool(r.payload.get("user"))}
            for r in rows
        ]})

    def post(self, request, recovery_id):
        password = request.data.get("password")
        if not password:
            return Response({"error": "Admin password is required."}, status=400)
        if not request.user.check_password(password):
            return Response({"error": "Incorrect admin password."}, status=403)
        try:
            recovery = DeletedDataRecovery.objects.get(id=recovery_id)
        except DeletedDataRecovery.DoesNotExist:
            return Response({"error": "Recovery item not found or expired."}, status=404)
        if recovery.expires_at <= timezone.now():
            recovery.delete()
            return Response({"error": "This recovery period has expired."}, status=410)

        payload = recovery.payload
        user_info = payload.get("user")
        if user_info and not User.objects.filter(id=user_info["id"]).exists():
            restored_user = User.objects.create(
                id=user_info["id"], email=user_info["email"], full_name=user_info.get("full_name", ""),
                password=user_info["password"], is_active=user_info.get("is_active", True),
                is_staff=user_info.get("is_staff", False), is_superuser=user_info.get("is_superuser", False),
                role=user_info.get("role", "user"),
                last_login=parse_datetime(user_info["last_login"]) if user_info.get("last_login") else None,
            )
            User.objects.filter(id=restored_user.id).update(created_at=parse_datetime(user_info["created_at"]))
        restored_searches, restored_leads = restore_payload(payload)
        log_activity(
            user=restored_user if user_info else None,
            actor=request.user,
            action="data_restored",
            details={
                "recoveryId": str(recovery.id),
                "searchCount": restored_searches,
                "leadCount": restored_leads,
            },
            user_email=(user_info or {}).get("email") or recovery.user_email or "",
        )
        recovery.delete()
        return Response({"restored": True, "searches": restored_searches, "leads": restored_leads, "userRestored": bool(user_info)})


def _parse_range_bound(raw, *, end_of_day=False):
    """Accepts either a bare date ("2026-08-01") or a full ISO datetime
    from the admin panel's date-range export filter, and returns an aware
    datetime usable in a created_at__gte/__lte lookup. Bare dates are
    anchored to the start of day (for "from") or end of day (for "to") in
    the server's current timezone. Returns None for empty/unparsable
    input, so a bad value is silently ignored rather than 500ing.
    """
    if not raw:
        return None
    dt = parse_datetime(raw)
    if dt is None:
        d = parse_date(raw)
        if d is None:
            return None
        dt = datetime.combine(d, time.max if end_of_day else time.min)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _csv_response(filename):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write("\ufeff")  # BOM so Excel opens accented characters correctly
    return response


def _json_response(filename):
    response = HttpResponse(content_type="application/json; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


# Every exportable column, per scope, as (key, header label, getter).
# The admin panel's column picker sends back a subset of these keys (in
# whatever order the admin picked them in); anything unrecognized is
# ignored rather than erroring, so a stale frontend build never 500s.
LEAD_COLUMNS = [
    ("userEmail", "User Email", lambda lead: lead.created_by_email),
    ("category", "Search Category", lambda lead: lead.search.category if lead.search_id else ""),
    ("location", "Search Location", lambda lead: lead.search.location if lead.search_id else ""),
    ("name", "Business Name", lambda lead: lead.name),
    ("address", "Address", lambda lead: lead.address),
    ("phone", "Phone", lambda lead: lead.phone),
    ("website", "Website", lambda lead: lead.website),
    ("rating", "Rating", lambda lead: lead.rating if lead.rating is not None else ""),
    ("reviews", "Reviews", lambda lead: lead.reviews if lead.reviews is not None else ""),
    ("rank", "Rank", lambda lead: lead.rank),
    ("status", "Status", lambda lead: lead.status),
    ("createdAt", "Searched At", lambda lead: timezone.localtime(lead.created_at).strftime("%Y-%m-%d %H:%M:%S")),
]

SEARCH_COLUMNS = [
    ("userEmail", "User Email", lambda s: s.created_by_email or (s.user.email if s.user_id else "")),
    ("category", "Category", lambda s: s.category),
    ("location", "Location", lambda s: s.location),
    ("maxResults", "Max Results", lambda s: s.max_results),
    ("scanned", "Scanned", lambda s: s.scanned),
    ("createdAt", "Created At", lambda s: timezone.localtime(s.created_at).strftime("%Y-%m-%d %H:%M:%S")),
]


class AdminExportsView(APIView):
    """GET /api/admin/exports/ - export history for non-admin accounts."""

    permission_classes = [IsAdminOrLead]

    def get(self, request):
        logs = (
            ActivityLog.objects.filter(action="export_requested")
            .exclude(user__is_superuser=True)
            .order_by("-created_at")[:500]
        )
        rows = []
        for log in logs:
            details = log.details or {}
            date_from = details.get("dateFrom")
            date_to = details.get("dateTo")
            range_label = ""
            if date_from or date_to:
                range_label = f"{date_from or 'start'} → {date_to or 'now'}"
            search_id = details.get("searchId")
            search_label = ""
            if search_id:
                try:
                    search = Search.objects.filter(id=search_id).first()
                    if search:
                        search_label = f"{search.category} · {search.location}"
                except Exception:
                    pass
            rows.append({
                "id": str(log.id),
                "userEmail": log.user_email,
                "scope": details.get("scope", "leads"),
                "searchLabel": search_label,
                "range": range_label,
                "rowCount": details.get("rowCount"),
                "filename": details.get("filename"),
                "userId": details.get("userId"),
                "columns": details.get("columns") or [],
                "searchId": details.get("searchId"),
                "createdAt": log.created_at.isoformat(),
            })
        return Response({"exports": rows})


class AdminExportReplayView(APIView):
    """Re-download a previously recorded export using its saved parameters."""

    permission_classes = [IsAdminOrLead]

    def get(self, request, export_id):
        try:
            log = ActivityLog.objects.get(id=export_id, action="export_requested")
        except ActivityLog.DoesNotExist:
            return Response({"error": "Export record not found."}, status=404)

        details = log.details or {}
        # Only replay exports that still refer to valid saved data. The target
        # user/search checks inside AdminExportView enforce the same access
        # rules as the original export.
        params = QueryDict("", mutable=True)
        for key in ("scope", "searchId", "dateFrom", "dateTo", "leadColumns", "searchColumns"):
            value = details.get(key)
            if isinstance(value, list):
                value = ",".join(str(item) for item in value)
            if value:
                params[key] = str(value)
        user_id = details.get("userId")
        if user_id:
            params["user"] = str(user_id)
        columns = details.get("columns")
        if isinstance(columns, list) and columns:
            params["columns"] = ",".join(str(value) for value in columns)

        request._request.GET = params
        return AdminExportView().get(request)


class AdminAuditLogExportView(APIView):
    """GET /api/admin/logs/export/ - CSV audit export with selectable columns."""

    permission_classes = [IsSuperUser]

    def get(self, request):
        date_from = _parse_range_bound(request.query_params.get("dateFrom"))
        date_to = _parse_range_bound(request.query_params.get("dateTo"), end_of_day=True)
        columns = [
            ("createdAt", "Time", lambda log: timezone.localtime(log.created_at).strftime("%Y-%m-%d %H:%M:%S")),
            ("userEmail", "User", lambda log: log.user_email or request.user.email),
            ("action", "Action", lambda log: log.action),
            ("details", "Details", lambda log: str(log.details or {})),
        ]
        requested = request.query_params.get("columns")
        if requested:
            by_key = {key: value for key, value in columns}
            selected = [by_key[key] for key in requested.split(",") if key in by_key]
            if selected:
                columns = selected

        queryset = ActivityLog.objects.filter(
            Q(user__isnull=True) | Q(user__is_superuser=False),
            Q(actor__isnull=True) | Q(actor__is_superuser=False),
        ).order_by("-created_at")
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)

        response = _csv_response(
            f"audit_logs_{timezone.localtime(timezone.now()).strftime('%Y%m%d_%H%M')}.csv"
        )
        writer = csv.writer(response)
        writer.writerow([label for _, label, _ in columns])
        for log in queryset.iterator():
            writer.writerow([getter(log) for _, _, getter in columns])
        return response


class AdminAuditLogsView(APIView):
    """GET /api/admin/logs/ - organization-wide audit trail for Admin only."""

    permission_classes = [IsSuperUser]

    def get(self, request):
        queryset = ActivityLog.objects.filter(
            Q(user__isnull=True) | Q(user__is_superuser=False),
            Q(actor__isnull=True) | Q(actor__is_superuser=False),
        ).select_related("user", "actor").order_by("-created_at")
        logs = queryset[:2000]
        admin_email = getattr(request.user, "email", "")
        return Response({
            "logs": [
                {
                    "id": str(log.id),
                    "userEmail": log.user_email or (log.user.email if log.user_id else admin_email),
                    "action": log.action,
                    "details": log.details,
                    "createdAt": log.created_at.isoformat(),
                    "actorEmail": log.actor.email if log.actor_id else "",
                }
                for log in logs
            ],
            "total": queryset.count(),
        })


class AdminUserLogsView(APIView):
    """GET /api/admin/users/<user_id>/logs/ - admin-only audit history."""

    permission_classes = [IsSuperUser]

    def get(self, request, user_id):
        try:
            target_user = User.objects.get(id=user_id, is_superuser=False, role__in=[User.Role.USER, User.Role.LEAD])
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        logs = ActivityLog.objects.filter(user=target_user).exclude(actor__is_superuser=True).select_related("actor")[:500]
        return Response(
            {
                "user": {
                    "id": str(target_user.id),
                    "email": target_user.email,
                    "fullName": target_user.full_name,
                    "role": "admin" if target_user.is_superuser else target_user.role,
                },
                "logs": [
                    {
                        "id": str(log.id),
                        "action": log.action,
                        "details": log.details,
                        "createdAt": log.created_at.isoformat(),
                        "actorEmail": log.actor.email if log.actor_id else log.user_email,
                    }
                    for log in logs
                ],
            }
        )



class AdminExportView(APIView):
    """GET /api/admin/export/ - export of saved search history, for the
    admin panel's export controls.

    Query params:
      user    - optional user id; restricts the export to that user's
                history. Omit to export every user's history.
      searchId - optional saved search id; for lead exports, restricts the
                 result to that one saved search.
      preview  - "1" returns JSON rows/count instead of downloading a file.
      scope   - "leads" (default) exports one row per lead. "searches"
                exports one row per search (summary level, no leads).
      format  - "csv" (default) or "json".
      columns - optional comma-separated list of column keys to include,
                in order (see LEAD_COLUMNS / SEARCH_COLUMNS above for the
                valid keys per scope). Omit to include every column.
      dateFrom, dateTo - optional range bounds (date "YYYY-MM-DD" or full
                ISO datetime) filtering on created_at, for timely/
                date-scoped exports. Either can be given alone. A bare
                dateFrom is anchored to the start of that day; a bare
                dateTo to the end of that day.
    """

    permission_classes = [IsAdminOrLead]

    def get(self, request):
        user_id = request.query_params.get("user")
        search_id = request.query_params.get("searchId")
        scope = request.query_params.get("scope", "leads")
        export_format = request.query_params.get("format", "csv")
        if export_format != "csv":
            return Response({"error": "Only CSV exports are supported."}, status=400)
        preview = request.query_params.get("preview") == "1"
        date_from = _parse_range_bound(request.query_params.get("dateFrom"))
        date_to = _parse_range_bound(request.query_params.get("dateTo"), end_of_day=True)

        if scope == "combined":
            # A combined export is deliberately ONE CSV file. It contains both
            # datasets in one unified table, with a Record Type column so the
            # recipient can distinguish Lead and Search rows.
            def pick_columns(defs, raw):
                if not raw:
                    return list(defs)
                wanted = [key for key in raw.split(",") if key]
                by_key = {key: (key, label, getter) for key, label, getter in defs}
                selected = [by_key[key] for key in wanted if key in by_key]
                return selected or list(defs)

            lead_defs = pick_columns(LEAD_COLUMNS, request.query_params.get("leadColumns"))
            search_defs = pick_columns(SEARCH_COLUMNS, request.query_params.get("searchColumns"))

            target_user = None
            if user_id:
                try:
                    target_user = User.objects.get(
                        id=user_id,
                        is_superuser=False,
                        role__in=[User.Role.USER, User.Role.LEAD],
                    )
                except User.DoesNotExist:
                    return Response({"error": "User not found."}, status=404)

            leads_qs = Lead.objects.select_related("search", "search__user").filter(
                search__user__is_superuser=False,
                search__user__is_active=True,
                search__user__role__in=[User.Role.USER, User.Role.LEAD],
            ).order_by("-search__created_at", "rank")
            searches_qs = Search.objects.select_related("user").filter(
                user__is_superuser=False,
                user__is_active=True,
                user__role__in=[User.Role.USER, User.Role.LEAD],
            ).order_by("-created_at")
            if target_user:
                leads_qs = leads_qs.filter(search__user=target_user)
                searches_qs = searches_qs.filter(user=target_user)
            if date_from:
                leads_qs = leads_qs.filter(search__created_at__gte=date_from)
                searches_qs = searches_qs.filter(created_at__gte=date_from)
            if date_to:
                leads_qs = leads_qs.filter(search__created_at__lte=date_to)
                searches_qs = searches_qs.filter(created_at__lte=date_to)

            safe_part = lambda value: "-".join(str(value or "").strip().lower().split())
            username_part = safe_part(target_user.email.split("@")[0]) if target_user else "all"
            export_timestamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M%S")
            filename_bits = [username_part, "data"]
            if date_from or date_to:
                filename_bits.append(
                    f"{date_from.strftime('%Y%m%d') if date_from else 'start'}"
                    f"-{date_to.strftime('%Y%m%d') if date_to else 'now'}"
                )
            filename_bits.append(export_timestamp)
            base_name = "_".join(filename_bits)

            # Common keys are emitted once. Lead-only and search-only keys are
            # appended in their selected order.
            combined_defs = [("recordType", "Record Type", lambda row: row[0])]
            used = {"recordType"}
            for key, label, getter in lead_defs + search_defs:
                if key in used:
                    continue
                combined_defs.append((key, label, None))
                used.add(key)

            log_activity(
                user=target_user,
                actor=request.user,
                action="export_requested",
                details={
                    "scope": "combined",
                    "format": "csv",
                    "preview": False,
                    "searchId": None,
                    "userId": str(target_user.id) if target_user else None,
                    "dateFrom": request.query_params.get("dateFrom"),
                    "dateTo": request.query_params.get("dateTo"),
                    "leadColumns": [key for key, _, _ in lead_defs],
                    "searchColumns": [key for key, _, _ in search_defs],
                    "rowCount": leads_qs.count() + searches_qs.count(),
                    "filename": f"{base_name}.csv",
                },
                user_email=target_user.email if target_user else "",
            )

            response = _csv_response(f"{base_name}.csv")
            writer = csv.writer(response)
            writer.writerow([label for _, label, _ in combined_defs])

            lead_getters = {key: getter for key, _, getter in lead_defs}
            search_getters = {key: getter for key, _, getter in search_defs}
            keys = [key for key, _, _ in combined_defs]
            for lead in leads_qs.iterator():
                row = ["Lead"]
                for key in keys[1:]:
                    getter = lead_getters.get(key)
                    row.append(getter(lead) if getter else "")
                writer.writerow(row)
            for search in searches_qs.iterator():
                row = ["Search"]
                for key in keys[1:]:
                    getter = search_getters.get(key)
                    row.append(getter(search) if getter else "")
                writer.writerow(row)
            return response

        column_defs = SEARCH_COLUMNS if scope == "searches" else LEAD_COLUMNS
        requested_keys = request.query_params.get("columns")
        if requested_keys:
            wanted = [k for k in requested_keys.split(",") if k]
            by_key = {key: (key, label, getter) for key, label, getter in column_defs}
            selected = [by_key[k] for k in wanted if k in by_key]
            if selected:
                column_defs = selected

        target_user = None
        if user_id:
            try:
                target_user = User.objects.get(id=user_id, is_superuser=False, role__in=[User.Role.USER, User.Role.LEAD])
            except User.DoesNotExist:
                return Response({"error": "User not found."}, status=404)

        safe_part = lambda value: "-".join(str(value or "").strip().lower().split())
        username_part = safe_part(target_user.email.split("@")[0]) if target_user else "all"
        export_timestamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M%S")
        query_name = ""
        if search_id and scope == "leads":
            try:
                search_for_name = Search.objects.get(id=search_id)
                query_name = "_".join(part for part in [safe_part(search_for_name.category), safe_part(search_for_name.location)] if part)[:100]
            except (Search.DoesNotExist, ValueError):
                pass

        # Human-readable filenames: username_query_leads.csv or
        # username_searches.csv. No product/app name is prefixed.
        filename_bits = [username_part]
        if query_name:
            filename_bits.append(query_name)
        filename_bits.append("leads" if scope == "leads" else "searches")
        if date_from or date_to:
            filename_bits.append(
                f"{date_from.strftime('%Y%m%d') if date_from else 'start'}"
                f"-{date_to.strftime('%Y%m%d') if date_to else 'now'}"
            )

        if scope == "searches":
            queryset = Search.objects.select_related("user").filter(user__is_superuser=False, user__is_active=True, user__role__in=[User.Role.USER, User.Role.LEAD]).order_by("-created_at")
            if target_user:
                queryset = queryset.filter(user=target_user)
        else:
            queryset = Lead.objects.select_related("search", "search__user").filter(search__user__is_superuser=False, search__user__is_active=True, search__user__role__in=[User.Role.USER, User.Role.LEAD]).order_by("-created_at")
            if target_user:
                queryset = queryset.filter(search__user=target_user)
            if search_id:
                queryset = queryset.filter(search_id=search_id)

        # The admin date/time filter represents when the saved search happened,
        # because the Saved leads list is grouped under Search records. Filter
        # lead exports through the parent search timestamp so the export uses
        # the exact same time basis as Search History. This also keeps exports
        # correct for any legacy/imported Lead rows whose own created_at may
        # differ from the search timestamp.
        date_field = "created_at" if scope == "searches" else "search__created_at"
        if date_from:
            queryset = queryset.filter(**{f"{date_field}__gte": date_from})
        if date_to:
            queryset = queryset.filter(**{f"{date_field}__lte": date_to})

        filename_bits.append(export_timestamp)
        base_name = "_".join(filename_bits)

        # The export event keeps the generated file name so the Export History
        # page can show exactly what was downloaded. No admin identity is stored.
        log_activity(
            user=target_user,
            actor=request.user,
            action="export_requested",
            details={
                "scope": scope,
                "format": export_format,
                "preview": preview,
                "searchId": search_id,
                "userId": str(target_user.id) if target_user else None,
                "dateFrom": request.query_params.get("dateFrom"),
                "dateTo": request.query_params.get("dateTo"),
                "columns": [key for key, _, _ in column_defs],
                "rowCount": queryset.count(),
                "filename": f"{base_name}.csv",
            },
            user_email=target_user.email if target_user else "",
        )

        if preview:
            if scope != "leads":
                return Response({"error": "Preview is available for lead data only."}, status=400)

            preview_limit = 2500
            rows = [
                {key: getter(row) for key, _, getter in column_defs}
                for row in queryset[:preview_limit]
            ]
            # JSON-safe values for Decimal/datetime/etc.
            import json
            rows = json.loads(json.dumps(rows, default=str))
            return Response(
                {
                    "scope": scope,
                    "count": queryset.count(),
                    "previewCount": len(rows),
                    "truncated": queryset.count() > preview_limit,
                    "columns": [{"key": key, "label": label} for key, label, _ in column_defs],
                    "rows": rows,
                }
            )

        response = _csv_response(f"{base_name}.csv")
        writer = csv.writer(response)
        writer.writerow([label for _, label, _ in column_defs])
        for row in queryset.iterator():
            writer.writerow([getter(row) for _, _, getter in column_defs])
        return response
