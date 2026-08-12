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

from django.contrib.auth import get_user_model
from django.db.models import Count, Max
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeletedDataRecovery, Lead, Search
from .recovery import snapshot_searches, restore_payload
from .permissions import IsSuperUser

User = get_user_model()


class AdminOverviewView(APIView):
    """GET /api/admin/overview/ - headline numbers for the admin dashboard."""

    permission_classes = [IsSuperUser]

    def get(self, request):
        now = timezone.now()
        last_7_days = now - timedelta(days=7)
        last_24_hours = now - timedelta(hours=24)

        recent_searches = (
            Search.objects.select_related("user")
            .order_by("-created_at")[:10]
        )

        return Response(
            {
                "totalUsers": User.objects.count(),
                "totalSearches": Search.objects.count(),
                "totalLeads": Lead.objects.count(),
                "searchesLast24h": Search.objects.filter(created_at__gte=last_24_hours).count(),
                "searchesLast7Days": Search.objects.filter(created_at__gte=last_7_days).count(),
                "newUsersLast7Days": User.objects.filter(created_at__gte=last_7_days).count(),
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


class AdminUsersView(APIView):
    """GET /api/admin/users/ - every user, with search/lead counts and
    last-active timestamp, so the admin panel can list & sort by activity.
    """

    permission_classes = [IsSuperUser]

    def get(self, request):
        users = (
            User.objects.all()
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


class AdminUserDeleteView(APIView):
    """Remove a user into the 3-day recovery bin after password confirmation."""
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
            return Response({"error": "You cannot delete your own admin account."}, status=400)
        if target_user.is_superuser:
            return Response({"error": "Superuser accounts cannot be deleted from this panel."}, status=400)

        payload = snapshot_searches(Search.objects.filter(user=target_user))
        payload["user"] = {
            "id": str(target_user.id), "email": target_user.email, "full_name": target_user.full_name,
            "password": target_user.password, "is_active": target_user.is_active,
            "is_staff": target_user.is_staff, "is_superuser": target_user.is_superuser,
            "created_at": target_user.created_at.isoformat(),
            "last_login": target_user.last_login.isoformat() if target_user.last_login else None,
        }
        now = timezone.now()
        recovery = DeletedDataRecovery.objects.create(
            kind="user", label=f"User removed: {target_user.email}", user_email=target_user.email,
            expires_at=now + timedelta(days=3), payload=payload,
        )
        target_user.delete()
        return Response({"deleted": True, "email": target_user.email, "recoveryId": str(recovery.id), "expiresAt": recovery.expires_at.isoformat()})


class AdminUserSearchesView(APIView):
    """GET /api/admin/users/<user_id>/searches/ - one user's full saved
    search history (every search that user has explicitly saved)."""

    permission_classes = [IsSuperUser]

    def get(self, request, user_id):
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        searches = (
            Search.objects.filter(user=target_user)
            .annotate(lead_count=Count("leads"))
            .order_by("-created_at")
        )

        return Response(
            {
                "user": {
                    "id": str(target_user.id),
                    "email": target_user.email,
                    "isStaff": target_user.is_staff,
                    "isSuperuser": target_user.is_superuser,
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
    """Move saved data to the 3-day recovery bin after password confirmation."""
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
                target_user = User.objects.get(id=user_id)
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
                last_login=parse_datetime(user_info["last_login"]) if user_info.get("last_login") else None,
            )
            User.objects.filter(id=restored_user.id).update(created_at=parse_datetime(user_info["created_at"]))
        restored_searches, restored_leads = restore_payload(payload)
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

    permission_classes = [IsSuperUser]

    def get(self, request):
        user_id = request.query_params.get("user")
        search_id = request.query_params.get("searchId")
        scope = request.query_params.get("scope", "leads")
        export_format = request.query_params.get("format", "csv")
        preview = request.query_params.get("preview") == "1"
        date_from = _parse_range_bound(request.query_params.get("dateFrom"))
        date_to = _parse_range_bound(request.query_params.get("dateTo"), end_of_day=True)

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
                target_user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({"error": "User not found."}, status=404)

        filename_bits = ["leadfinder_admin_export"]
        if target_user:
            filename_bits.append(target_user.email.split("@")[0])
        if date_from or date_to:
            filename_bits.append(
                f"{date_from.strftime('%Y%m%d') if date_from else 'start'}"
                f"-{date_to.strftime('%Y%m%d') if date_to else 'now'}"
            )
        filename_bits.append(timezone.localtime(timezone.now()).strftime("%Y-%m-%d_%H%M"))

        if scope == "searches":
            queryset = Search.objects.select_related("user").order_by("-created_at")
            if target_user:
                queryset = queryset.filter(user=target_user)
        else:
            queryset = Lead.objects.select_related("search", "search__user").order_by("-created_at")
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

        base_name = f"{'_'.join(filename_bits)}_{scope}"

        if export_format == "json":
            import json

            rows = [
                {key: getter(row) for key, _, getter in column_defs} for row in queryset.iterator()
            ]
            response = _json_response(f"{base_name}.json")
            response.write(json.dumps(rows, indent=2, default=str))
            return response

        response = _csv_response(f"{base_name}.csv")
        writer = csv.writer(response)
        writer.writerow([label for _, label, _ in column_defs])
        for row in queryset.iterator():
            writer.writerow([getter(row) for _, _, getter in column_defs])
        return response
