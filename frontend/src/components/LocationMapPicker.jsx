import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, Locate, MapPin, Search, X } from "lucide-react";

// Leaflet's default marker icon references image files by relative URL,
// which breaks under Vite's bundling. Point it at the CDN copies instead
// of trying to import binary assets through the bundler.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_CENTER = [13.0827, 80.2707]; // Chennai - a sane fallback if geolocation is unavailable/denied.

/** Nominatim (OpenStreetMap) reverse geocode: lat/lng -> a human-readable address. */
async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
  );
  if (!res.ok) throw new Error("Reverse geocoding failed");
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Nominatim forward geocode: free-text search -> list of candidate places. */
async function searchPlaces(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=5`,
  );
  if (!res.ok) throw new Error("Location search failed");
  return res.json();
}

/**
 * Modal for picking a location visually on a map instead of typing it.
 * Calls onSelect(addressString) and closes itself when the user confirms.
 */
export function LocationMapPicker({ onSelect, onClose }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [error, setError] = useState("");

  function placeMarker(lat, lng, map) {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { icon: markerIcon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current.getLatLng();
        resolveAddress(pos.lat, pos.lng);
      });
    }
  }

  async function resolveAddress(lat, lng) {
    setIsResolving(true);
    setError("");
    try {
      const address = await reverseGeocode(lat, lng);
      setSelectedAddress(address);
    } catch {
      setError("Couldn't look up an address for that spot - you can still use the raw coordinates.");
      setSelectedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setIsResolving(false);
    }
  }

  // Set up the map once on mount.
  useEffect(() => {
    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 12,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e) => {
      placeMarker(e.latlng.lat, e.latlng.lng, map);
      resolveAddress(e.latlng.lat, e.latlng.lng);
    });

    // Try to center on the user's current location for convenience.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 14);
        },
        () => {
          /* Permission denied or unavailable - just keep the default center. */
        },
        { timeout: 5000 },
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearchSubmit(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError("");
    try {
      const results = await searchPlaces(query.trim());
      setSearchResults(results);
      if (results.length === 0) {
        setError("No matches found - try a different search.");
      }
    } catch {
      setError("Location search failed. Check your connection and try again.");
    } finally {
      setIsSearching(false);
    }
  }

  function goToResult(result) {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    setSearchResults([]);
    setQuery("");
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat, lng], 15);
    placeMarker(lat, lng, map);
    setSelectedAddress(result.display_name);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support geolocation.");
      return;
    }
    setIsLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;
        if (map) {
          map.setView([latitude, longitude], 15);
          placeMarker(latitude, longitude, map);
        }
        resolveAddress(latitude, longitude);
        setIsLocating(false);
      },
      () => {
        setError("Couldn't get your location - allow location access, or pick a spot on the map.");
        setIsLocating(false);
      },
      { timeout: 8000 },
    );
  }

  function confirm() {
    if (!selectedAddress) return;
    onSelect(selectedAddress);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Pick a location on the map</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a city, area, or address…"
                className="field field-focus w-full pl-8"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
            </button>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={isLocating}
              title="Use my current location"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-50"
            >
              {isLocating ? <Loader2 className="size-4 animate-spin" /> : <Locate className="size-4" />}
            </button>
          </form>

          {searchResults.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border">
              {searchResults.map((result) => (
                <li key={result.place_id}>
                  <button
                    type="button"
                    onClick={() => goToResult(result)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-raised"
                  >
                    {result.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div ref={mapContainerRef} className="h-80 w-full shrink-0" />

        <div className="space-y-2 border-t border-border px-5 py-4">
          <p className="label-mono">Selected location</p>
          <p className="min-h-[1.5rem] text-sm">
            {isResolving ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Looking up address…
              </span>
            ) : (
              selectedAddress || (
                <span className="text-muted-foreground">
                  Click anywhere on the map, drag the pin, or search above.
                </span>
              )
            )}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!selectedAddress || isResolving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use this location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
