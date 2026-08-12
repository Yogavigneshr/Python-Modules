"""
Port of src/lib/places.server.js.

Fetches candidate businesses from Google Places (Text Search, new API),
then filters/scores them into "leads" per the caller's criteria.
Pure business logic - no Django/DRF imports here on purpose, so it stays
easy to unit test in isolation.
"""

import math
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional

import requests

PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# How many Google Places requests we let run at once. Queries (and grid
# cells) are independent of one another, so fetching them concurrently
# instead of one-by-one is a straight latency win with no change in what
# gets returned - it just collects the same pages faster. Pages *within*
# a single query still have to be fetched one after another, since each
# page needs the token the previous page returned.
MAX_CONCURRENT_REQUESTS = 10

# A pooled session per worker thread (module-level, keyed by thread id)
# so repeated requests reuse TCP/TLS connections instead of renegotiating
# a new connection for every single call.
_thread_local = threading.local()


def _session() -> requests.Session:
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=MAX_CONCURRENT_REQUESTS,
            pool_maxsize=MAX_CONCURRENT_REQUESTS,
        )
        session.mount("https://", adapter)
        _thread_local.session = session
    return session

FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.googleMapsUri",
        "places.rating",
        "places.userRatingCount",
        "places.types",
        "places.primaryType",
        "places.businessStatus",
        "places.location",
        "nextPageToken",
    ]
)

# Well-known franchise/chain markers, checked as whole words in the name.
CHAIN_KEYWORDS = [
    "naturals",
    "green trends",
    "toni&guy",
    "toni & guy",
    "lakme",
    "jawed habib",
    "bounce",
    "vlcc",
    "starbucks",
    "mcdonald",
    "domino",
    "kfc",
    "subway",
    "cafe coffee day",
    "ccd",
    "pizza hut",
    "burger king",
    "barbeque nation",
    "apollo",
    "dr. agarwal",
    "reliance",
    "croma",
    "decathlon",
    "cult.fit",
    "cultfit",
    "anytime fitness",
    "gold's gym",
    "golds gym",
]

STOP_WORDS = {
    "in", "near", "the", "and", "for", "of", "a", "an", "best", "top",
    "shop", "shops", "service", "services",
}


def normalize_name(name: str) -> str:
    name = (name or "").lower()
    name = re.sub(r"[^a-z0-9& ]+", " ", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def tokens(value: str) -> list[str]:
    return [t for t in normalize_name(value).split(" ") if len(t) > 2 and t not in STOP_WORDS]


def build_chain_detector(places: list[dict]):
    """A place is a chain when its normalized name repeats in the raw
    result set, or matches a known franchise keyword."""
    counts: dict[str, int] = {}
    for p in places:
        n = normalize_name((p.get("displayName") or {}).get("text", ""))
        if not n:
            continue
        counts[n] = counts.get(n, 0) + 1

    def is_chain(name: str) -> bool:
        n = normalize_name(name)
        if counts.get(n, 0) > 1:
            return True
        return any(normalize_name(kw) in n for kw in CHAIN_KEYWORDS)

    return is_chain


def fetch_page(
    api_key: str,
    text_query: str,
    page_token: Optional[str] = None,
    location_bias: Optional[tuple[float, float, int]] = None,
) -> dict:
    body = {
        "textQuery": text_query,
        # RELEVANCE mirrors the ordering Google itself uses for the query.
        "rankPreference": "RELEVANCE",
        "pageSize": 20,
    }
    if page_token:
        body["pageToken"] = page_token
    if location_bias:
        lat, lng, radius_m = location_bias
        body["locationBias"] = {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}
        }

    response = _session().post(
        PLACES_TEXT_SEARCH_URL,
        json=body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        },
        timeout=15,
    )
    if not response.ok:
        raise RuntimeError(f"Google Places request failed [{response.status_code}]: {response.text}")

    data = response.json()
    return {"places": data.get("places", []), "nextPageToken": data.get("nextPageToken")}


def geocode_location(api_key: str, location: str) -> Optional[tuple[float, float]]:
    """Best-effort center point for `location`, reusing the same Places
    Text Search call/API key rather than needing the separate Geocoding
    API enabled. Returns None if nothing usable comes back - callers just
    skip the grid-search tier in that case."""
    try:
        page = fetch_page(api_key, location)
    except Exception:
        return None
    for place in page["places"]:
        loc = place.get("location") or {}
        lat, lng = loc.get("latitude"), loc.get("longitude")
        if lat is not None and lng is not None:
            return (lat, lng)
    return None


def build_grid(center_lat: float, center_lng: float) -> list[tuple[float, float, int]]:
    """Ring(s) of (lat, lng, radius_m) sub-search points around a center.
    A single text query only ever returns Google's top ~60 most relevant
    results for the whole area; searching several overlapping sub-areas
    surfaces additional real, distinct businesses a single query can't
    reach - the standard way to pull a large result set from Places
    Text Search. Distances account for longitude degrees shrinking away
    from the equator."""
    lat_rad = math.radians(center_lat)
    km_per_deg_lat = 111.0
    km_per_deg_lng = 111.0 * max(math.cos(lat_rad), 0.15)

    def offset(dist_km: float, bearing_deg: float) -> tuple[float, float]:
        rad = math.radians(bearing_deg)
        d_lat = (dist_km * math.cos(rad)) / km_per_deg_lat
        d_lng = (dist_km * math.sin(rad)) / km_per_deg_lng
        return (center_lat + d_lat, center_lng + d_lng)

    points: list[tuple[float, float, int]] = [(center_lat, center_lng, 4000)]
    # Ring 1: 8 points ~6km out, radius 4km each (light overlap for
    # continuous coverage without redoing the same ground twice).
    for bearing in range(0, 360, 45):
        lat, lng = offset(6, bearing)
        points.append((lat, lng, 4000))
    # Ring 2: 12 points ~13km out, wider radius - only used if ring 1
    # still isn't enough (search_leads only calls this tier when needed).
    for bearing in range(0, 360, 30):
        lat, lng = offset(13, bearing)
        points.append((lat, lng, 5000))
    return points


def build_queries(category: str, location: str) -> list[str]:
    """Query variations used to fan out past the 60-result-per-query ceiling
    Google's Places Text Search API imposes. Ordered cheapest/most-relevant
    first; extra directional/qualifier phrasings are appended so that large
    requests (e.g. 200 results) still have enough distinct phrasings to draw
    unique candidates from once dedup removes overlap between queries.
    """
    c = category.strip()
    l = location.strip()
    return [
        f"{c} in {l}",
        f"{c} near {l}",
        f"best {c} in {l}",
        f"{c} {l}",
        f"local {c} in {l}",
        f"{c} around {l}",
        f"top {c} in {l}",
        f"{c} services in {l}",
        f"{c} company in {l}",
        f"{c} shop in {l}",
        f"find {c} in {l}",
        f"{c} nearby {l}",
        # Extra phrasings - Google's ranking shuffles enough on these to
        # surface additional unique places once the queries above are
        # exhausted, which matters once a caller asks for a large
        # max_results (e.g. 200) that the first 12 variations can't fill.
        f"{c} north {l}",
        f"{c} south {l}",
        f"{c} east {l}",
        f"{c} west {l}",
        f"{c} central {l}",
        f"affordable {c} in {l}",
        f"professional {c} in {l}",
        f"{c} close to {l}",
        f"{c} open now in {l}",
        f"popular {c} in {l}",
        f"{c} reviews {l}",
        f"{c} near me {l}",
    ]


@dataclass
class SearchParams:
    category: str
    location: str
    max_results: int
    hide_chains: bool
    require_phone: bool
    require_website: bool
    within_location: bool
    min_rating: float
    min_reviews: int


def _fetch_all_pages_for_query(
    api_key: str,
    query: str,
    location_bias: Optional[tuple[float, float, int]],
) -> list[dict]:
    """Fetches every page (up to Google's 3-page/60-result ceiling) for a
    single query. Pages have to be requested one after another since each
    needs the token the previous page returned - but this whole function
    runs on its own worker thread, so multiple queries proceed at once."""
    places: list[dict] = []
    page_token = None
    pages = 0
    while True:
        page = fetch_page(api_key, query, page_token, location_bias)
        places.extend(page["places"])
        page_token = page["nextPageToken"]
        pages += 1
        # 3 pages x 20 results/page = 60 is Google's own ceiling per
        # query - going further just returns an empty/invalid token.
        if not page_token or pages >= 3:
            break
    return places


def _collect_from_queries(
    api_key: str,
    queries: list[str],
    seen: set[str],
    raw: list[dict],
    cap: int,
    location_bias: Optional[tuple[float, float, int]] = None,
) -> None:
    """Fetches every query in `queries` concurrently (each query's own
    pages are still sequential - see _fetch_all_pages_for_query), merging
    newly-seen places into `raw` in place as results come back. Running
    the independent queries in parallel rather than one-by-one is what
    makes a 200-result search return in a few seconds instead of a
    couple of minutes."""
    pending = [q for q in queries if len(raw) < cap]
    if not pending:
        return

    lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, len(pending))) as pool:
        futures = {
            pool.submit(_fetch_all_pages_for_query, api_key, query, location_bias): query
            for query in pending
        }
        for future in as_completed(futures):
            query = futures[future]
            places = future.result()
            with lock:
                if len(raw) >= cap:
                    continue
                for place in places:
                    key = place.get("id") or f"{query}:{(place.get('displayName') or {}).get('text', '')}"
                    if key in seen:
                        continue
                    seen.add(key)
                    raw.append(place)


def _collect_from_grid(
    api_key: str, category: str, grid: list[tuple[float, float, int]], seen: set[str], raw: list[dict], cap: int, needed: int
) -> None:
    """Runs the category query once per grid cell, biased to that cell's
    area, all concurrently, stopping short only if the grid itself is
    exhausted (results still come back in parallel batches even though
    the target check happens once up front)."""
    cells = [(lat, lng, radius_m) for lat, lng, radius_m in grid if len(raw) < cap and len(raw) < needed]
    if not cells:
        return

    lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, len(cells))) as pool:
        futures = {
            pool.submit(_fetch_all_pages_for_query, api_key, category, (lat, lng, radius_m)): (lat, lng, radius_m)
            for lat, lng, radius_m in cells
        }
        for future in as_completed(futures):
            lat, lng, radius_m = futures[future]
            places = future.result()
            with lock:
                if len(raw) >= cap or len(raw) >= needed:
                    continue
                for place in places:
                    key = place.get("id") or f"{lat},{lng}:{(place.get('displayName') or {}).get('text', '')}"
                    if key in seen:
                        continue
                    seen.add(key)
                    raw.append(place)


def search_leads(api_key: str, params: SearchParams) -> dict:
    # Fetch as much as is genuinely available rather than stopping at a
    # small heuristic ceiling. RAW_SAFETY_CAP is just a sanity backstop.
    RAW_SAFETY_CAP = 3000
    all_queries = build_queries(params.category, params.location)
    core_queries, extra_queries = all_queries[:12], all_queries[12:]

    seen: set[str] = set()
    raw: list[dict] = []

    _collect_from_queries(api_key, core_queries, seen, raw, RAW_SAFETY_CAP)

    # A caller asking for a large number of results (e.g. 200) needs more
    # than the 12 core phrasings can uniquely supply once duplicates are
    # removed - so keep widening the search with the extra phrasings
    # until we comfortably clear max_results, or we genuinely run out.
    needed = max(params.max_results * 2, 100)
    if len(raw) < needed and len(raw) < RAW_SAFETY_CAP:
        _collect_from_queries(api_key, extra_queries, seen, raw, RAW_SAFETY_CAP)

    # Still short after every phrasing variation has been tried: a single
    # text query - however it's worded - only ever returns Google's ~60
    # most relevant results for the *whole* area, so wording alone plateaus.
    # Geocode the location and fan out across a grid of overlapping
    # sub-areas instead; each cell gets its own top-~60 results, which is
    # how real "200+ leads in a city" results get assembled.
    if len(raw) < needed and len(raw) < RAW_SAFETY_CAP:
        center = geocode_location(api_key, params.location)
        if center:
            grid = build_grid(*center)
            _collect_from_grid(api_key, params.category, grid, seen, raw, RAW_SAFETY_CAP, needed)

    is_chain = build_chain_detector(raw)
    location_tokens = tokens(params.location)

    # Note: we intentionally do NOT run any automatic "does this place's
    # Google type match the searched category" filter, and we don't drop
    # permanently-closed listings either. Both used to silently remove
    # real results Google Maps itself was already returning for the exact
    # same query. Every place Google's Places API returns for the query is
    # included; only the filters the user explicitly controls below - and
    # only when the user turns them on - can exclude a result now, so
    # counts stay accurate to what Maps shows.
    excluded = {
        "outsideLocation": 0,
        "missingPhone": 0,
        "missingWebsite": 0,
        "belowMinRating": 0,
        "belowMinReviews": 0,
        "chain": 0,
    }

    leads = []
    for index, place in enumerate(raw):
        name = (place.get("displayName") or {}).get("text", "")
        phone = place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber") or ""
        website = place.get("websiteUri") or ""
        rating = place.get("rating") or 0
        reviews = place.get("userRatingCount") or 0
        address = place.get("formattedAddress") or ""

        if params.within_location and location_tokens:
            haystack = normalize_name(address)
            if not any(t in haystack for t in location_tokens):
                excluded["outsideLocation"] += 1
                continue

        if params.require_phone and not phone:
            excluded["missingPhone"] += 1
            continue

        if params.require_website and not website:
            excluded["missingWebsite"] += 1
            continue

        if rating < params.min_rating:
            excluded["belowMinRating"] += 1
            continue

        if reviews < params.min_reviews:
            excluded["belowMinReviews"] += 1
            continue

        if params.hide_chains and is_chain(name):
            excluded["chain"] += 1
            continue

        leads.append(
            {
                "placeId": place.get("id") or str(index),
                "name": name,
                "address": address,
                "phone": phone,
                "website": website,
                "maps": place.get("googleMapsUri") or "",
                "rating": rating,
                "reviews": reviews,
                # Rank is the position Google returned it in, before filtering.
                "rank": index + 1,
            }
        )

    return {
        "leads": leads[: params.max_results],
        "scanned": len(raw),
        "excluded": excluded,
    }
