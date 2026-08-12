from django.contrib import admin

from .models import Lead, PlacesCache, Search


@admin.register(Search)
class SearchAdmin(admin.ModelAdmin):
    list_display = ("category", "location", "user", "created_by_email", "scanned", "created_at")
    list_filter = ("created_at",)
    search_fields = ("category", "location", "user__email", "created_by_email")


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "search",
        "created_by_email",
        "rating",
        "reviews",
        "status",
        "hidden",
        "created_date",
        "created_time",
    )
    list_filter = ("status", "hidden", "created_date")
    search_fields = ("name", "place_id", "created_by_email")


admin.site.register(PlacesCache)
