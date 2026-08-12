from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


class UserAdmin(DjangoUserAdmin):
    model = User
    list_display = ("email", "is_staff", "is_superuser", "is_active", "created_at")
    ordering = ("-created_at",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )
    search_fields = ("email",)


admin.site.register(User, UserAdmin)
