import { Fragment, useEffect, useState } from "react";
import { Activity, Clock3, Download, Loader2, Search, ShieldAlert, Users } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Link, Navigate } from "@/router/Router";

function formatTimestamp(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Stat({ icon: Icon, label, value, href }) {
  return (
    <Link
      to={href}
      className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground transition-colors group-hover:text-primary">
          Open →
        </span>
      </div>
      <p className="mt-5 text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tracking-tight">{value}</p>
    </Link>
  );
}

export function AdminPage() {
  useDocumentTitle("Dashboard");
  const { user, loading } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [exporting, setExporting] = useState(false);
  const [searchExporting, setSearchExporting] = useState(null);
  const [expandedSearch, setExpandedSearch] = useState(null);
  const [expandedLeads, setExpandedLeads] = useState({ loading: false, data: null, error: null });

  const canManage = !!user && (user.is_superuser || user.role === "lead");

  useEffect(() => {
    if (!canManage) return;
    setState({ loading: true, data: null, error: null });
    adminApi
      .getOverview()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error: error.message }));
  }, [canManage]);

  async function exportAll() {
    setExporting(true);
    try {
      await adminApi.exportHistory({ scope: "leads", format: "csv" });
    } finally {
      setExporting(false);
    }
  }

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  if (!canManage)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="mx-auto size-8" />
          <h1 className="mt-3 font-bold">Management access required</h1>
        </div>
      </main>
    );

  const overview = state.data || {};
  const roleLabel = user.is_superuser ? "Admin" : "Lead";

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="Dashboard" subtitle={`${roleLabel.toUpperCase()} · WORKSPACE`} />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <section className="mb-7 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
            <div className="relative p-6 sm:p-8 lg:p-10">
              <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="label-mono text-accent">{user.email}</p>
                  <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                    Dashboard
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                    Manage users, monitor searches, review lead activity, and export your data from
                    one clean workspace.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={exportAll} disabled={exporting} className="gap-2 rounded-xl">
                    {exporting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Export all data
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {state.error && (
            <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Users}
              label="Total users"
              value={overview.totalUsers ?? "—"}
              href="/admin/users"
            />
            <Stat
              icon={Search}
              label="Total searches"
              value={overview.totalSearches ?? "—"}
              href="/admin/searches"
            />
            <Stat
              icon={Activity}
              label="Leads saved"
              value={overview.totalLeads ?? "—"}
              href="/admin/exports"
            />
            <Stat
              icon={Clock3}
              label="Searches · 24h"
              value={overview.searchesLast24h ?? "—"}
              href="/admin/searches?range=24h"
            />
          </section>

          <section className="rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
              <div>
                <p className="label-mono text-accent">LIVE ACTIVITY</p>
                <h2 className="mt-1 text-lg font-bold">Recent searches</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The latest saved searches across the workspace.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to="/admin/searches">View all searches</Link>
              </Button>
            </div>
            {state.loading ? (
              <p className="px-6 py-10 text-sm text-muted-foreground">Loading activity…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["User", "Category", "Location", "Leads scanned", "Searched at", ""].map(
                        (h) => (
                          <th key={h} className="label-mono px-5 py-3 text-left">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.recentSearches || []).map((item) => (
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
                            } catch (err) {
                              setExpandedLeads({ loading: false, data: null, error: err.message });
                            }
                          }}
                          className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-primary/[0.03]"
                        >
                          <td className="px-5 py-4 font-medium">{item.userEmail || "—"}</td>
                          <td className="px-5 py-4">{item.category}</td>
                          <td className="px-5 py-4 text-muted-foreground">{item.location}</td>
                          <td className="px-5 py-4 font-mono">{item.scanned ?? 0}</td>
                          <td className="px-5 py-4 text-muted-foreground">{formatTimestamp(item.createdAt)}</td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              disabled={searchExporting === item.id}
                              onClick={async (event) => {
                                event.stopPropagation();
                                setSearchExporting(item.id);
                                try {
                                  await adminApi.exportSearchLeadsCsv(item.id);
                                } catch (err) {
                                  setState((current) => ({ ...current, error: err.message }));
                                } finally {
                                  setSearchExporting(null);
                                }
                              }}
                            >
                              {searchExporting === item.id ? "Exporting…" : "Export leads"}
                            </Button>
                          </td>
                        </tr>
                        {expandedSearch === item.id && (
                          <tr className="border-b border-border bg-surface-raised/40">
                            <td colSpan="6" className="p-0">
                              {expandedLeads.loading ? (
                                <div className="px-6 py-8 text-sm text-muted-foreground">Loading saved leads…</div>
                              ) : expandedLeads.error ? (
                                <div className="px-6 py-8 text-sm text-destructive">{expandedLeads.error}</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
                                    <div><p className="font-semibold">{item.category} · {item.location}</p><p className="text-xs text-muted-foreground">{expandedLeads.data?.leads?.length || 0} saved leads</p></div>
                                    <Button size="sm" variant="outline" className="gap-2" disabled={!expandedLeads.data?.leads?.length || searchExporting === item.id} onClick={(event) => { event.stopPropagation(); adminApi.exportSearchLeadsCsv(item.id).catch((err) => setState((current) => ({ ...current, error: err.message }))); }}>
                                      <Download className="size-4" /> Export leads
                                    </Button>
                                  </div>
                                  <table className="w-full min-w-[900px] text-sm">
                                    <thead><tr className="border-b border-border">{["Business", "Address", "Phone", "Website", "Rating", "Reviews"].map((head) => <th key={head} className="label-mono px-5 py-3 text-left">{head}</th>)}</tr></thead>
                                    <tbody>{(expandedLeads.data?.leads || []).map((lead) => <tr key={lead.placeId} className="border-b border-border/60 last:border-0"><td className="px-5 py-3 font-medium">{lead.name || "—"}</td><td className="max-w-sm px-5 py-3 text-xs">{lead.address || "—"}</td><td className="px-5 py-3 text-xs">{lead.phone || "—"}</td><td className="max-w-sm px-5 py-3 text-xs">{lead.website || "—"}</td><td className="px-5 py-3">{lead.rating ?? "—"}</td><td className="px-5 py-3">{lead.reviews ?? "—"}</td></tr>)}</tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {!overview.recentSearches?.length && (
                      <tr>
                        <td
                          colSpan="6"
                          className="px-5 py-10 text-center text-sm text-muted-foreground"
                        >
                          No recent searches.
                        </td>
                      </tr>
                    )}
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
