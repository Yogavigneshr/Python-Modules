from django.urls import path

from .admin_api import (
    AdminClearDataView,
    AdminCreateUserView,
    AdminExportView,
    AdminExportReplayView,
    AdminOverviewView,
    AdminUserSearchesView,
    AdminUserLogsView,
    AdminAuditLogsView,
    AdminUsersView,
    AdminRecentSearchesView,
    AdminLeadRequestsView,
    AdminUserDeleteView,
    AdminRecoveryView,
    AdminExportsView,
    AdminAuditLogExportView,
)
from .views import SaveSearchView, SearchLeadsDetailView, SearchLeadsView

urlpatterns = [
    path("search-leads/", SearchLeadsView.as_view(), name="search-leads"),
    path("searches/save/", SaveSearchView.as_view(), name="save-search"),
    path("searches/<uuid:search_id>/leads/", SearchLeadsDetailView.as_view(), name="search-leads-detail"),
    # Admin panel (staff/superuser only) - see leads/admin_api.py.
    path("admin/overview/", AdminOverviewView.as_view(), name="admin-overview"),
    path("admin/users/", AdminUsersView.as_view(), name="admin-users"),
    path("admin/users/create/", AdminCreateUserView.as_view(), name="admin-user-create"),

    path("admin/searches/", AdminRecentSearchesView.as_view(), name="admin-searches"),
    path("admin/lead-requests/", AdminLeadRequestsView.as_view(), name="admin-lead-requests"),
    path("admin/lead-requests/<uuid:request_id>/", AdminLeadRequestsView.as_view(), name="admin-lead-request-review"),
    path("admin/users/<uuid:user_id>/", AdminUserDeleteView.as_view(), name="admin-user-delete"),
    path(
        "admin/users/<uuid:user_id>/searches/",
        AdminUserSearchesView.as_view(),
        name="admin-user-searches",
    ),
    path(
        "admin/users/<uuid:user_id>/logs/",
        AdminUserLogsView.as_view(),
        name="admin-user-logs",
    ),
    path("admin/logs/", AdminAuditLogsView.as_view(), name="admin-audit-logs"),
    path("admin/logs/export/", AdminAuditLogExportView.as_view(), name="admin-audit-log-export"),
    path("admin/logs/export", AdminAuditLogExportView.as_view(), name="admin-audit-log-export-no-slash"),
    path("admin/exports/", AdminExportsView.as_view(), name="admin-exports"),
    path("admin/exports/<uuid:export_id>/download/", AdminExportReplayView.as_view(), name="admin-export-replay"),
    path("admin/export/", AdminExportView.as_view(), name="admin-export"),
    path("admin/export", AdminExportView.as_view(), name="admin-export-no-slash"),
    path("admin/clear/", AdminClearDataView.as_view(), name="admin-clear"),
    path("admin/recovery/", AdminRecoveryView.as_view(), name="admin-recovery"),
    path("admin/recovery/<uuid:recovery_id>/restore/", AdminRecoveryView.as_view(), name="admin-recovery-restore"),
]
