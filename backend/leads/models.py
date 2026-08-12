import uuid

from django.conf import settings
from django.db import models


class Search(models.Model):
    """Replaces the `searches` table from db/schema.sql."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="searches"
    )
    # Denormalized copy of user.email at the time the search was run. The
    # `user` FK above is still the source of truth (and what every query
    # filters on), but having the email directly on the row means it shows
    # up in exports/admin/raw SQL without a join - handy once several
    # people are using the same app and you want to see who searched what.
    created_by_email = models.EmailField(db_index=True, blank=True, default="")
    category = models.CharField(max_length=120)
    location = models.CharField(max_length=120)
    max_results = models.IntegerField(default=20)
    filters = models.JSONField()  # hideChains, requirePhone, minRating, etc.
    scanned = models.IntegerField(default=0)
    excluded = models.JSONField(null=True, blank=True)  # breakdown by exclusion reason
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user"])]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.category} in {self.location} ({self.created_at:%Y-%m-%d})"


class Lead(models.Model):
    """Replaces the `leads` table from db/schema.sql."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    search = models.ForeignKey(Search, on_delete=models.CASCADE, related_name="leads")
    # Same denormalization as Search.created_by_email - copied from
    # search.created_by_email at creation time, so each lead row shows
    # which user's search produced it without a join back to Search/User.
    created_by_email = models.EmailField(db_index=True, blank=True, default="")
    place_id = models.CharField(max_length=255, db_index=True)
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    website = models.CharField(max_length=500, blank=True)
    maps_url = models.CharField(max_length=500, blank=True)
    rating = models.DecimalField(max_digits=2, decimal_places=1, null=True, blank=True)
    reviews = models.IntegerField(null=True, blank=True)
    rank = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    notes = models.TextField(blank=True)
    hidden = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # Split-out date/time columns, populated at the same instant as
    # created_at, so the date and time can be filtered/displayed/exported
    # independently without re-parsing a datetime.
    created_date = models.DateField(auto_now_add=True, db_index=True)
    created_time = models.TimeField(auto_now_add=True)

    class Meta:
        ordering = ["rank"]

    def __str__(self):
        return self.name


class PlacesCache(models.Model):
    """Replaces the `places_cache` table from db/schema.sql."""

    cache_key = models.CharField(max_length=300, primary_key=True)  # "category|location"
    raw_places = models.JSONField()
    fetched_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)


class DeletedDataRecovery(models.Model):
    """Temporary recycle-bin entry for admin deletions. Payload is retained for 3 days."""

    KIND_CHOICES = (("user", "User"), ("user_data", "User data"), ("all_data", "All data"))
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    label = models.CharField(max_length=255)
    user_email = models.EmailField(blank=True, default="")
    deleted_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    payload = models.JSONField()

    class Meta:
        ordering = ["-deleted_at"]
