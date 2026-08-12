from django.urls import path

from .admin_api import (
    AdminClearDataView,
    AdminExportView,
    AdminOverviewView,
    AdminUserSearchesView,
    AdminUsersView,
    AdminUserDeleteView,
    AdminRecoveryView,
)
from .views import SaveSearchView, SearchLeadsDetailView, SearchLeadsView

urlpatterns = [
    path("search-leads/", SearchLeadsView.as_view(), name="search-leads"),
    path("searches/save/", SaveSearchView.as_view(), name="save-search"),
    path("searches/<uuid:search_id>/leads/", SearchLeadsDetailView.as_view(), name="search-leads-detail"),
    # Admin panel (staff/superuser only) - see leads/admin_api.py.
    path("admin/overview/", AdminOverviewView.as_view(), name="admin-overview"),
    path("admin/users/", AdminUsersView.as_view(), name="admin-users"),
    path("admin/users/<uuid:user_id>/", AdminUserDeleteView.as_view(), name="admin-user-delete"),
    path(
        "admin/users/<uuid:user_id>/searches/",
        AdminUserSearchesView.as_view(),
        name="admin-user-searches",
    ),
    path("admin/export/", AdminExportView.as_view(), name="admin-export"),
    path("admin/clear/", AdminClearDataView.as_view(), name="admin-clear"),
    path("admin/recovery/", AdminRecoveryView.as_view(), name="admin-recovery"),
    path("admin/recovery/<uuid:recovery_id>/restore/", AdminRecoveryView.as_view(), name="admin-recovery-restore"),
]
