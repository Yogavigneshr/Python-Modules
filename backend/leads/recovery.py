from decimal import Decimal

from django.utils.dateparse import parse_date, parse_time, parse_datetime

from .models import Lead, Search


def _dt(value):
    return parse_datetime(value) if isinstance(value, str) else value


def snapshot_search(search):
    return {
        "id": str(search.id), "user_id": str(search.user_id),
        "created_by_email": search.created_by_email, "category": search.category,
        "location": search.location, "max_results": search.max_results,
        "filters": search.filters, "scanned": search.scanned, "excluded": search.excluded,
        "created_at": search.created_at.isoformat(),
    }


def snapshot_lead(lead):
    return {
        "id": str(lead.id), "search_id": str(lead.search_id),
        "created_by_email": lead.created_by_email, "place_id": lead.place_id,
        "name": lead.name, "address": lead.address, "phone": lead.phone,
        "website": lead.website, "maps_url": lead.maps_url,
        "rating": str(lead.rating) if lead.rating is not None else None,
        "reviews": lead.reviews, "rank": lead.rank, "status": lead.status,
        "notes": lead.notes, "hidden": lead.hidden,
        "created_at": lead.created_at.isoformat(),
        "created_date": lead.created_date.isoformat(),
        "created_time": lead.created_time.isoformat(),
    }


def snapshot_searches(queryset):
    searches = list(queryset.select_related("user"))
    leads = list(Lead.objects.filter(search__in=searches))
    return {"searches": [snapshot_search(s) for s in searches], "leads": [snapshot_lead(l) for l in leads]}


def restore_payload(payload):
    searches = payload.get("searches", [])
    leads = payload.get("leads", [])
    search_objects = []
    for item in searches:
        if Search.objects.filter(id=item["id"]).exists():
            continue
        search_objects.append(Search(
            id=item["id"], user_id=item["user_id"], created_by_email=item.get("created_by_email", ""),
            category=item["category"], location=item["location"], max_results=item.get("max_results", 20),
            filters=item.get("filters") or {}, scanned=item.get("scanned", 0), excluded=item.get("excluded"),
            created_at=_dt(item["created_at"]),
        ))
    if search_objects:
        Search.objects.bulk_create(search_objects)

    lead_objects = []
    for item in leads:
        if Lead.objects.filter(id=item["id"]).exists():
            continue
        lead_objects.append(Lead(
            id=item["id"], search_id=item["search_id"], created_by_email=item.get("created_by_email", ""),
            place_id=item.get("place_id", ""), name=item.get("name", ""), address=item.get("address", ""),
            phone=item.get("phone", ""), website=item.get("website", ""), maps_url=item.get("maps_url", ""),
            rating=Decimal(item["rating"]) if item.get("rating") is not None else None,
            reviews=item.get("reviews"), rank=item.get("rank"), status=item.get("status", Lead.Status.NEW),
            notes=item.get("notes", ""), hidden=item.get("hidden", False), created_at=_dt(item["created_at"]),
            created_date=parse_date(item["created_date"]), created_time=parse_time(item["created_time"]),
        ))
    if lead_objects:
        Lead.objects.bulk_create(lead_objects)
    return len(search_objects), len(lead_objects)
