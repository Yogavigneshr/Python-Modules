import { useEffect, useState } from "react";
import {
  Search,
  Globe,
  Phone,
  Star,
  MapPin,
  Loader2,
  X,
  LogOut,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  ShieldCheck,
  Save,
  Check,
} from "lucide-react";
import { leadsApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useMutation } from "@/hooks/use-mutation";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Link, Navigate } from "@/router/Router";

// Every search is capped at this many results, server-side (see
// leads/serializers.py's MAX_RESULTS_CEILING). There's no user-facing
// control for it - a search for a specific place only ever returns what
// actually exists there, up to this ceiling, never padded out further.
const RESULTS_CEILING = 200;

const initialForm = {
  category: "",
  location: "",
  hideChains: false,
  requirePhone: false,
  requireWebsite: false,
  minRating: 0,
  minReviews: 0,
};

// Suggestions shown in the category dropdown. These are just a starting
// point - the field stays free text, so any category can still be typed.
const CATEGORY_SUGGESTIONS = [
  "Unisex salon",
  "Hair salon",
  "Spa",
  "Restaurant",
  "Cafe",
  "Gym",
  "Yoga studio",
  "Dentist",
  "Doctor's clinic",
  "Pharmacy",
  "Hospital",
  "Real estate agent",
  "Law firm",
  "Accountant",
  "Interior designer",
  "Architect",
  "Photographer",
  "Wedding planner",
  "Electrician",
  "Plumber",
  "Carpenter",
  "Car repair shop",
  "Car dealership",
  "Bakery",
  "Grocery store",
  "Clothing store",
  "Jewelry store",
  "Furniture store",
  "Electronics store",
  "Hardware store",
  "Hotel",
  "Travel agency",
  "Insurance agency",
  "Bank",
  "Coworking space",
  "IT services company",
  "Digital marketing agency",
  "School",
  "Tuition center",
  "Veterinary clinic",
  "Pet store",
];

// Sortable result fields, and how to read a comparable value off a lead.
const SORT_FIELDS = [
  { key: "rank", label: "Rank", get: (l) => l.rank ?? 0 },
  { key: "name", label: "Name", get: (l) => (l.name || "").toLowerCase() },
  { key: "rating", label: "Rating", get: (l) => l.rating ?? 0 },
  { key: "reviews", label: "Reviews", get: (l) => l.reviews ?? 0 },
];

// Formats an ISO timestamp the same way everywhere it's shown.
function formatTimestamp(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sortLeads(leads, sortKey, sortDir) {
  const field = SORT_FIELDS.find((f) => f.key === sortKey) ?? SORT_FIELDS[0];
  const dir = sortDir === "desc" ? -1 : 1;
  return [...leads].sort((a, b) => {
    const av = field.get(a);
    const bv = field.get(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export function LeadFinderPage() {
  useDocumentTitle("Ranked Local Business Leads");

  const [form, setForm] = useState(initialForm);
  const [hiddenIds, setHiddenIds] = useState([]);
  const { user, loading, signOut } = useAuth();

  // The category/location that produced the currently-shown results -
  // captured at submit time so it stays correct even if the person edits
  // the form afterward.
  const [lastQuery, setLastQuery] = useState(null);

  const mutation = useMutation({
    mutationFn: (payload) => leadsApi.searchLeads(payload),
  });

  // Client-side sort of the currently shown results.
  const [sortKey, setSortKey] = useState("rank");
  const [sortDir, setSortDir] = useState("asc");

  // "idle" | "saving" | "saved" | "error" - results are only ever written
  // to the database when the user presses Save.
  const [saveState, setSaveState] = useState("idle");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  const allLeads = mutation.data?.leads ?? [];
  const visibleLeads = allLeads.filter((l) => !hiddenIds.includes(l.placeId));
  const leads = sortLeads(visibleLeads, sortKey, sortDir);
  const hiddenCount = allLeads.length - visibleLeads.length;
  const resultsTimestamp = mutation.data?.createdAt;
  const searchMeta = lastQuery;

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event) {
    event.preventDefault();
    setHiddenIds([]);
    setSaveState("idle");
    setLastQuery({ category: form.category, location: form.location });
    mutation.mutate(form);
  }

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Saves exactly what's currently on screen (visible, non-hidden rows)
  // to the database. This is the only path that ever writes a search or
  // its leads to storage.
  async function handleSave() {
    if (visibleLeads.length === 0) return;
    setSaveState("saving");
    try {
      await leadsApi.saveSearch({
        category: searchMeta?.category || "",
        location: searchMeta?.location || "",
        filters: {
          hideChains: form.hideChains,
          requirePhone: form.requirePhone,
          requireWebsite: form.requireWebsite,
          minRating: form.minRating,
          minReviews: form.minReviews,
        },
        scanned: mutation.data?.scanned ?? 0,
        excluded: mutation.data?.excluded ?? {},
        leads: visibleLeads,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        {!loading &&
          (user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user.email}</span>
              {user.is_superuser && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  Superuser
                </span>
              )}
              {user.is_superuser && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin" className="inline-flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    Admin panel
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          ))}
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <form
          onSubmit={onSubmit}
          className="space-y-5 self-start rounded-xl border border-border bg-surface p-5 shadow-sm shadow-black/[0.02]"
        >
          <Field label="Category">
            <input
              className="field field-focus"
              placeholder="e.g. unisex salon"
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              list="category-suggestions"
              autoComplete="off"
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Location">
            <input
              className="field field-focus"
              placeholder="e.g. Guindy, Chennai"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
            />
          </Field>

          <div className="space-y-3 border-t border-border pt-5">
            <p className="label-mono">Business filters</p>
            <Toggle
              label="Hide chain businesses"
              checked={form.hideChains}
              onChange={(v) => update("hideChains", v)}
            />
            <Toggle
              label="Require phone"
              checked={form.requirePhone}
              onChange={(v) => update("requirePhone", v)}
            />
            <Toggle
              label="Require website"
              checked={form.requireWebsite}
              onChange={(v) => update("requireWebsite", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-5">
            <Field label="Min rating">
              {/* No upper bound - Places ratings top out at 5 in practice,
                  but the field itself doesn't enforce that, so a filter
                  like "5.0 exactly" isn't artificially blocked. */}
              <input
                type="number"
                min={0}
                step={0.1}
                className="field field-focus"
                value={form.minRating}
                onChange={(e) => update("minRating", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Min reviews">
              <input
                type="number"
                min={0}
                step={1}
                className="field field-focus"
                value={form.minReviews}
                onChange={(e) => update("minReviews", Number(e.target.value) || 0)}
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm shadow-accent/20 transition-all hover:opacity-90 hover:shadow-md hover:shadow-accent/25 disabled:opacity-60 disabled:hover:shadow-sm"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            {mutation.isPending ? "Searching…" : "Find leads"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Returns up to {RESULTS_CEILING} matching businesses - fewer if that's all there are.
          </p>
        </form>

        <section className="protected-content relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">Results</h2>
              {resultsTimestamp && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  Searched {formatTimestamp(resultsTimestamp)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {leads.length > 0 && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveState === "saving" || saveState === "saved"}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saveState === "saving" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : saveState === "saved" ? (
                    <Check className="size-3.5 text-primary" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save results"}
                </button>
              )}
              {saveState === "error" && (
                <span className="label-mono text-destructive">Save failed · try again</span>
              )}
              {leads.length > 1 && (
                <label className="flex items-center gap-1.5 label-mono">
                  <ArrowUpDown className="size-3.5 text-muted-foreground" />
                  Sort by
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium"
                  >
                    {SORT_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    title={sortDir === "asc" ? "Ascending" : "Descending"}
                    className="rounded-md border border-border p-1 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                  >
                    {sortDir === "asc" ? (
                      <ArrowUp className="size-3.5" />
                    ) : (
                      <ArrowDown className="size-3.5" />
                    )}
                  </button>
                </label>
              )}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setHiddenIds([])}
                  className="label-mono text-primary underline-offset-2 hover:underline"
                >
                  {hiddenCount} hidden · unhide all
                </button>
              )}
              <p className="label-mono">
                {mutation.data ? `${leads.length} shown · ${mutation.data.scanned} scanned` : "no search yet"}
              </p>
            </div>
          </div>

          {!mutation.isError && mutation.isPending && <SearchingState />}

          {!mutation.isError && !mutation.isPending && leads.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-surface-raised text-muted-foreground">
                {mutation.data ? <Search className="size-5" /> : <MapPin className="size-5" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {mutation.data
                  ? "No businesses matched these filters. Try loosening them."
                  : "Enter a category and location to pull ranked leads."}
              </p>
            </div>
          )}

          {mutation.isError && (
            <p className="px-5 py-8 text-sm text-destructive">{mutation.error.message}</p>
          )}

          {leads.length > 0 && (
            <div
              className="select-none overflow-x-auto"
              onContextMenu={(e) => e.preventDefault()}
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            >
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      { label: "#", sortKey: "rank" },
                      { label: "Business", sortKey: "name" },
                      { label: "Contact", sortKey: null },
                      { label: "Rating", sortKey: "rating" },
                      { label: "Reviews", sortKey: "reviews" },
                      { label: "Searched at", sortKey: null },
                      { label: "", sortKey: null },
                    ].map((col, i) => (
                      <th key={col.label || i} className="label-mono px-5 py-3 text-left font-semibold">
                        {col.sortKey ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col.sortKey)}
                            className="inline-flex items-center gap-1 hover:text-primary"
                          >
                            {col.label}
                            {sortKey === col.sortKey &&
                              (sortDir === "asc" ? (
                                <ArrowUp className="size-3" />
                              ) : (
                                <ArrowDown className="size-3" />
                              ))}
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.placeId}
                      className="border-b border-border/60 align-top last:border-0 transition-colors hover:bg-surface-raised"
                    >
                      <td className="px-5 py-4">
                        <span className="rank-badge">{String(lead.rank).padStart(2, "0")}</span>
                      </td>
                      <td className="max-w-md px-5 py-4">
                        <div className="font-bold">{lead.name}</div>
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3 shrink-0" />
                          <span>{lead.address}</span>
                        </div>
                        {lead.maps && (
                          <a
                            href={lead.maps}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-block text-xs text-primary underline-offset-2 hover:underline"
                          >
                            Open in Maps
                          </a>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1.5 text-xs">
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              className="flex items-center gap-1.5 hover:text-primary"
                            >
                              <Phone className="size-3" />
                              {lead.phone}
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="size-3" /> —
                            </span>
                          )}
                          {lead.website ? (
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 hover:text-primary"
                            >
                              <Globe className="size-3" />
                              {shortHost(lead.website)}
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Globe className="size-3" /> —
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold">
                          <Star className="size-3.5 fill-accent text-accent" />
                          {lead.rating || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-muted-foreground">
                        {lead.reviews.toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Clock className="size-3" />
                          {formatTimestamp(lead.createdAt) || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          aria-label={`Hide ${lead.name}`}
                          title="Hide this result"
                          onClick={() => setHiddenIds((prev) => [...prev, lead.placeId])}
                          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-destructive"
                        >
                          <X className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2">
      <span className="label-mono block">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

// Cycles through what the search is doing so a ~5-30s wait (Google
// Places is queried across many query phrasings, and sometimes a whole
// grid of sub-areas, to assemble a large result set) reads as active
// progress instead of a frozen page.
const SEARCH_STAGES = [
  "Querying Google Places…",
  "Fanning out across query phrasings…",
  "Deduplicating matches…",
  "Scoring and ranking results…",
  "Almost there…",
];

function SearchingState() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, SEARCH_STAGES.length - 1));
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <div className="relative flex size-14 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/20" />
        <span className="relative inline-flex size-14 items-center justify-center rounded-full bg-accent/10">
          <Search className="size-5 text-accent" />
        </span>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground transition-opacity duration-300">
          {SEARCH_STAGES[stageIndex]}
        </p>
        <p className="text-xs text-muted-foreground">
          Larger areas can take a little longer - this stays live the whole way.
        </p>
      </div>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {SEARCH_STAGES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i <= stageIndex ? "w-6 bg-primary" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function shortHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
