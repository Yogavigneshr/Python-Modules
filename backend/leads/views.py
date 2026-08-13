import re

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Lead, Search
from .audit import log_activity
from .places_service import SearchParams, search_leads
from .serializers import (
    MAX_RESULTS_CEILING,
    SaveSearchRequestSerializer,
    SearchLeadsRequestSerializer,
)


def normalize_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


class SearchLeadsView(APIView):
    """POST /api/search-leads/

    Runs a live search and returns results. Nothing is written to the
    database here - a search only becomes a saved record when the user
    explicitly calls /api/searches/save/ (see SaveSearchView below).

    Every search:
      - is capped at MAX_RESULTS_CEILING (200) results, server-side,
        regardless of what the client asks for;
      - is always restricted to the searched location (`within_location`
        is forced on) - a location with 22 real matches returns 22, not
        padded with businesses from neighbouring areas to reach the cap.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SearchLeadsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        api_key = settings.GOOGLE_PLACES_API_KEY
        if not api_key:
            return Response(
                {"error": "Search is not configured. Please contact support."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        params = SearchParams(
            category=data["category"],
            location=data["location"],
            max_results=MAX_RESULTS_CEILING,
            hide_chains=data["hideChains"],
            require_phone=data["requirePhone"],
            require_website=data["requireWebsite"],
            # Always on - a search for a specific place should only ever
            # return businesses actually in that place, never padded out
            # with nearby-area results to approach the results cap.
            within_location=True,
            min_rating=data["minRating"],
            min_reviews=data["minReviews"],
        )
        try:
            result = search_leads(api_key, params)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        # IMPORTANT: a live search is transient. Do not create Search, Lead,
        # or ActivityLog rows here. The query and its results are persisted
        # only when the user explicitly presses the Save results button
        # through SaveSearchView below.
        search_timestamp = timezone.now()
        timestamped_leads = [
            {
                **lead,
                "createdAt": search_timestamp.isoformat(),
                "createdDate": search_timestamp.date().isoformat(),
                "createdTime": search_timestamp.time().isoformat(timespec="seconds"),
                "createdByEmail": request.user.email,
            }
            for lead in result["leads"]
        ]
        return Response(
            {
                **result,
                "leads": timestamped_leads,
                "createdAt": search_timestamp.isoformat(),
                "createdByEmail": request.user.email,
            }
        )


class SaveSearchView(APIView):
    """POST /api/searches/save/

    Persists a search + its leads to the database. This is the *only*
    place a search/lead row ever gets written - called when the user
    explicitly presses "Save", using the results they were already shown
    (no second Google Places call).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SaveSearchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        category = normalize_key(data["category"])
        location = normalize_key(data["location"])
        leads_payload = data["leads"]

        # Save the complete operation atomically. If one Google result contains
        # an unusually long field, normalize it to the database column size so
        # one bad row cannot make the whole user-side Save button fail.
        def clip(value, limit):
            return str(value or "")[:limit]

        try:
            with transaction.atomic():
                saved_search = Search.objects.create(
                    user=request.user,
                    created_by_email=clip(request.user.email, 254),
                    category=category,
                    location=location,
                    max_results=MAX_RESULTS_CEILING,
                    filters=data.get("filters") or {},
                    scanned=data.get("scanned", 0),
                    excluded=data.get("excluded") or None,
                )

                if leads_payload:
                    Lead.objects.bulk_create(
                        [
                            Lead(
                                search=saved_search,
                                created_by_email=clip(request.user.email, 254),
                                place_id=clip(lead.get("placeId"), 255),
                                name=clip(lead.get("name"), 255),
                                address=clip(lead.get("address"), 500),
                                phone=clip(lead.get("phone"), 50),
                                website=clip(lead.get("website"), 500),
                                maps_url=clip(lead.get("maps"), 500),
                                rating=lead.get("rating") or 0,
                                reviews=lead.get("reviews") or 0,
                                rank=lead.get("rank") or 0,
                            )
                            for lead in leads_payload
                        ],
                        batch_size=100,
                    )

                log_activity(
                    user=request.user,
                    actor=request.user,
                    action="search_saved",
                    details={
                        "searchId": str(saved_search.id),
                        "category": category,
                        "location": location,
                        "leadCount": len(leads_payload),
                    },
                )
        except Exception:
            # Never leave a half-created saved search behind. The client gets a
            # normal failure response and can safely press Save results again.
            return Response(
                {"error": "Unable to save these results. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "id": str(saved_search.id),
                "savedCount": len(leads_payload),
                "createdAt": saved_search.created_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )


class SearchLeadsDetailView(APIView):
    """GET /api/searches/<search_id>/leads/ - the full, saved lead list
    for one saved search, read straight from the database. Used by the
    admin panel to inspect what a user saved; regular users have no
    browsing UI for this (no search history is kept in the app).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, search_id):
        try:
            # Superusers and Leads may inspect a saved search from the
            # operational user panel. Ordinary users remain scoped to self.
            is_admin = request.user.is_superuser or getattr(request.user, "role", None) == "lead"
            queryset = Search.objects.all() if is_admin else Search.objects.filter(user=request.user)
            search = queryset.get(id=search_id)
        except Search.DoesNotExist:
            return Response({"error": "Search not found."}, status=status.HTTP_404_NOT_FOUND)

        leads = search.leads.order_by("rank")
        if request.user.id != search.user_id:
            log_activity(
                user=search.user,
                actor=request.user,
                action="saved_search_viewed",
                details={"searchId": str(search.id), "leadCount": leads.count()},
            )
        return Response(
            {
                "id": str(search.id),
                "category": search.category,
                "location": search.location,
                "maxResults": search.max_results,
                "filters": search.filters,
                "scanned": search.scanned,
                "excluded": search.excluded,
                "createdAt": search.created_at.isoformat(),
                "createdByEmail": search.created_by_email,
                "leads": [
                    {
                        "placeId": lead.place_id,
                        "name": lead.name,
                        "address": lead.address or "",
                        "phone": lead.phone or "",
                        "website": lead.website or "",
                        "maps": lead.maps_url or "",
                        "rating": float(lead.rating) if lead.rating is not None else 0,
                        "reviews": lead.reviews or 0,
                        "rank": lead.rank,
                        "createdAt": lead.created_at.isoformat(),
                        "createdDate": lead.created_date.isoformat(),
                        "createdTime": lead.created_time.isoformat(timespec="seconds"),
                        "createdByEmail": lead.created_by_email,
                    }
                    for lead in leads
                ],
            }
        )
