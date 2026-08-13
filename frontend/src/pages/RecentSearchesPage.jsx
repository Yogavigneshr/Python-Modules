import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, History, Loader2, Search } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navigate, usePath } from "@/router/Router";

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export function RecentSearchesPage() {
  useDocumentTitle("Recent searches");
  const { user, loading } = useAuth();
  const path = usePath();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(null);
  const [expandedSearch, setExpandedSearch] = useState(null);
  const [expandedLeads, setExpandedLeads] = useState({ loading: false, data: null, error: null });
  const canManage = !!user && (user.is_superuser || user.role === "lead");
  const range24h =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("range") === "24h";

  useEffect(() => {
    if (!canManage) return;
    adminApi
      .getRecentSearches()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error: error.message }));
  }, [canManage]);

  const searches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (state.data?.searches || []).filter((item) => {
      if (range24h && new Date(item.createdAt).getTime() < cutoff) return false;
      return (
        !needle ||
        `${item.userEmail} ${item.category} ${item.location}`.toLowerCase().includes(needle)
      );
    });
  }, [state.data, query, range24h]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  if (!canManage) return <Navigate to="/" />;

  async function exportSearch(id) {
    setExporting(id);
    try {
      await adminApi.exportSearchLeadsCsv(id);
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="Recent searches" subtitle="SEARCH HISTORY" />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <div className="mb-4 flex items-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl"
              onClick={() =>
                window.history.length > 1
                  ? window.history.back()
                  : (window.location.href = "/admin")
              }
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
          </div>

          <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="label-mono text-accent">SEARCH HISTORY</p>
                <h1 className="mt-2 font-display text-3xl font-bold">
                  {range24h ? "Searches · 24h" : "Recent searches"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {range24h
                    ? "Only searches from the last 24 hours are shown."
                    : "Every saved search is listed here."}{" "}
                  Export the exact leads produced by any search.
                </p>
              </div>
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search history"
                  className="h-11 pl-9"
                />
              </div>
            </div>
          </section>

          {state.error && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-bold">Saved search history</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {searches.length} visible searches
                </p>
              </div>
              <History className="size-5 text-muted-foreground" />
            </div>
            {state.loading ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Loading search history…
              </p>
            ) : searches.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No search history found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["User", "Search", "Location", "Leads saved", "Searched at"].map(
                        (heading) => (
                          <th key={heading} className="label-mono px-5 py-3 text-left">
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {searches.map((item) => (
                      <Fragment key={item.id}>
                        <tr
                          onClick={async () => {
                            if (expandedSearch === item.id) {
                              setExpandedSearch(null);
                              setExpandedLeads({ loading: false, data: null, error: null });
                              return;
                            }
                            setExpandedSearch(item.id);
                            setExpandedLeads({ loading: true, data: null, error: null });
                            try {
                              const data = await adminApi.getSearchLeads(item.id);
                              setExpandedLeads({ loading: false, data, error: null });
                            } catch (error) {
                              setExpandedLeads({
                                loading: false,
                                data: null,
                                error: error.message,
                              });
                            }
                          }}
                          className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-primary/[0.03]"
                        >
                          <td className="px-5 py-4 font-medium">{item.userEmail || "—"}</td>
                          <td className="px-5 py-4">{item.category}</td>
                          <td className="px-5 py-4 text-muted-foreground">{item.location}</td>
                          <td className="px-5 py-4 font-mono">{item.leadCount ?? 0}</td>
                          <td className="px-5 py-4 text-muted-foreground">
                            {formatTimestamp(item.createdAt)}
                          </td>
                        </tr>
                        {expandedSearch === item.id && (
                          <tr className="border-b border-border bg-surface-raised/40">
                            <td colSpan="5" className="p-0">
                              {expandedLeads.loading ? (
                                <div className="px-6 py-7 text-sm text-muted-foreground">
                                  Loading saved leads…
                                </div>
                              ) : expandedLeads.error ? (
                                <div className="px-6 py-7 text-sm text-destructive">
                                  {expandedLeads.error}
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
                                    <div>
                                      <p className="font-semibold">
                                        {item.category} · {item.location}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {expandedLeads.data?.leads?.length || 0} saved leads
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-2"
                                      disabled={
                                        !expandedLeads.data?.leads?.length || exporting === item.id
                                      }
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        exportSearch(item.id);
                                      }}
                                    >
                                      <Download className="size-3.5" /> Export leads
                                    </Button>
                                  </div>
                                  <table className="w-full min-w-[900px] text-sm">
                                    <thead>
                                      <tr className="border-b border-border">
                                        {[
                                          "Business",
                                          "Address",
                                          "Phone",
                                          "Website",
                                          "Rating",
                                          "Reviews",
                                        ].map((head) => (
                                          <th key={head} className="label-mono px-5 py-3 text-left">
                                            {head}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(expandedLeads.data?.leads || []).map((lead) => (
                                        <tr
                                          key={lead.placeId}
                                          className="border-b border-border/60 last:border-0"
                                        >
                                          <td className="px-5 py-3 font-medium">
                                            {lead.name || "—"}
                                          </td>
                                          <td className="max-w-sm px-5 py-3 text-xs">
                                            {lead.address || "—"}
                                          </td>
                                          <td className="px-5 py-3 text-xs">{lead.phone || "—"}</td>
                                          <td className="max-w-sm px-5 py-3 text-xs">
                                            {lead.website || "—"}
                                          </td>
                                          <td className="px-5 py-3">{lead.rating ?? "—"}</td>
                                          <td className="px-5 py-3">{lead.reviews ?? "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
