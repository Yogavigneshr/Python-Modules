from rest_framework import serializers

# Hard ceiling on how many results a single search can ever return. The
# frontend no longer exposes a "max results" control at all - every search
# is capped here, server-side, so a tampered/replayed request can't ask
# for more than this regardless of what the client sends.
MAX_RESULTS_CEILING = 200


class SearchLeadsRequestSerializer(serializers.Serializer):
    """Mirrors the zod `searchSchema` from src/lib/places.functions.js."""

    category = serializers.CharField(trim_whitespace=True, min_length=1, max_length=120)
    location = serializers.CharField(trim_whitespace=True, min_length=1, max_length=120)
    hideChains = serializers.BooleanField()
    requirePhone = serializers.BooleanField()
    requireWebsite = serializers.BooleanField()
    # No upper bound: a search for "5-star only" places or "10k+ review"
    # chains is a legitimate filter, and Places data itself enforces the
    # realistic ceiling (ratings never exceed 5, reviews rarely exceed a
    # few hundred thousand) - so there's nothing useful an artificial cap
    # here protects against. Only sub-zero values are rejected.
    minRating = serializers.FloatField(min_value=0)
    minReviews = serializers.IntegerField(min_value=0)


class LeadResultSerializer(serializers.Serializer):
    placeId = serializers.CharField()
    name = serializers.CharField()
    address = serializers.CharField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    website = serializers.CharField(allow_blank=True)
    maps = serializers.CharField(allow_blank=True)
    rating = serializers.FloatField()
    reviews = serializers.IntegerField()
    rank = serializers.IntegerField()
    createdAt = serializers.DateTimeField()
    createdDate = serializers.DateField()
    createdTime = serializers.TimeField()
    createdByEmail = serializers.EmailField(allow_blank=True)


class LeadInputSerializer(serializers.Serializer):
    """One lead as handed back to the save endpoint - the client just
    echoes rows it already received from /search-leads/, so every field
    here is forgiving (defaults instead of hard failures) rather than
    re-validating shape the server itself produced moments earlier."""

    placeId = serializers.CharField()
    name = serializers.CharField()
    address = serializers.CharField(allow_blank=True, required=False, default="")
    phone = serializers.CharField(allow_blank=True, required=False, default="")
    website = serializers.CharField(allow_blank=True, required=False, default="")
    maps = serializers.CharField(allow_blank=True, required=False, default="")
    rating = serializers.FloatField(required=False, default=0)
    reviews = serializers.IntegerField(required=False, default=0)
    rank = serializers.IntegerField(required=False, default=0)


class SaveSearchRequestSerializer(serializers.Serializer):
    """POST /api/searches/save/ - persists a search + its leads only when
    the user explicitly clicks Save. Nothing is written to the database
    before this is called."""

    category = serializers.CharField(trim_whitespace=True, min_length=1, max_length=120)
    location = serializers.CharField(trim_whitespace=True, min_length=1, max_length=120)
    filters = serializers.JSONField(required=False, default=dict)
    scanned = serializers.IntegerField(required=False, default=0, min_value=0)
    excluded = serializers.JSONField(required=False, default=dict)
    leads = LeadInputSerializer(many=True, allow_empty=True)
