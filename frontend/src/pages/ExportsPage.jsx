import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, Download, FileDown, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Navigate } from "@/router/Router";

const LEAD_COLUMNS = [
  ["userEmail", "User email"],
  ["category", "Search category"],
  ["location", "Search location"],
  ["name", "Business name"],
  ["address", "Address"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["rating", "Rating"],
  ["reviews", "Reviews"],
  ["rank", "Rank"],
  ["status", "Status"],
  ["createdAt", "Searched at"],
];

const SEARCH_COLUMNS = [
  ["userEmail", "User email"],
  ["category", "Search category"],
  ["location", "Search location"],
  ["maxResults", "Max results"],
  ["scanned", "Leads scanned"],
  ["createdAt", "Searched at"],
];

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

function ColumnPicker({ title, columns, selected, setSelected }) {
  const all = selected.length === columns.length;
  const toggleAll = () => setSelected(all ? [] : columns.map(([key]) => key));
  const toggle = (key) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  const selectedLabels = columns
    .filter(([key]) => selected.includes(key))
    .map(([, label]) => label);

  return (
    <details className="group relative">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-background px-3.5 text-sm font-medium shadow-sm transition-colors hover:bg-surface-raised [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-semibold">{title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {selected.length === columns.length
              ? `All ${columns.length} selected`
              : `${selected.length} of ${columns.length} selected`}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {selectedLabels.slice(0, 3).join(", ")}
            {selectedLabels.length > 3 ? ` +${selectedLabels.length - 3}` : ""}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleAll();
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {all ? "Clear" : "Select all"}
          </button>
        </div>
        <div className="grid max-h-60 overflow-y-auto sm:grid-cols-2">
          {columns.map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 border-b border-border/50 px-3 py-2 text-xs hover:bg-surface-raised"
            >
              <Checkbox checked={selected.includes(key)} onCheckedChange={() => toggle(key)} />
              <span>{label}</span>
              {selected.includes(key) && <Check className="ml-auto size-3.5 text-primary" />}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

export function ExportsPage() {
  useDocumentTitle("Exports");
  const { user, loading } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportLeads, setExportLeads] = useState(true);
  const [exportSearches, setExportSearches] = useState(true);
  const [leadColumns, setLeadColumns] = useState(LEAD_COLUMNS.map(([key]) => key));
  const [searchColumns, setSearchColumns] = useState(SEARCH_COLUMNS.map(([key]) => key));
  const [history, setHistory] = useState({ loading: true, data: null, error: null });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const canManage = !!user && (user.is_superuser || user.role === "lead");

  useEffect(() => {
    if (!canManage) return;
    adminApi
      .getExportHistory()
      .then((data) => setHistory({ loading: false, data, error: null }))
      .catch((err) => setHistory({ loading: false, data: null, error: err.message }));
  }, [canManage]);

  const exports = useMemo(() => history.data?.exports || [], [history.data]);

  async function runExport() {
    if (!exportLeads && !exportSearches) {
      setError("Select at least one data set to export.");
      return;
    }
    if (exportLeads && !leadColumns.length) {
      setError("Select at least one lead column.");
      return;
    }
    if (exportSearches && !searchColumns.length) {
      setError("Select at least one search column.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      if (exportLeads && exportSearches) {
        await adminApi.exportCombinedHistory({ dateFrom, dateTo, leadColumns, searchColumns });
      } else if (exportLeads) {
        await adminApi.exportHistory({ scope: "leads", columns: leadColumns, dateFrom, dateTo });
      } else if (exportSearches) {
        await adminApi.exportHistory({
          scope: "searches",
          columns: searchColumns,
          dateFrom,
          dateTo,
        });
      }
      const data = await adminApi.getExportHistory();
      setHistory({ loading: false, data, error: null });
    } catch (err) {
      setError(err.message);
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
  if (!canManage) return <Navigate to="/" />;

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="Exports" subtitle="DATA · EXPORT CENTRE" />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <p className="label-mono text-accent">DATA EXPORT</p>
            <h1 className="mt-2 font-display text-3xl font-bold">Export workspace data</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Choose a date range and exactly which data and columns you want. Both datasets and
              every column start selected.
            </p>

            {error && (
              <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="label-mono">From date</span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
              </label>
              <label className="space-y-1.5">
                <span className="label-mono">To date</span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-4 hover:bg-surface-raised">
                <Checkbox checked={exportLeads} onCheckedChange={setExportLeads} />
                <span>
                  <b className="block">Leads</b>
                  <span className="text-xs text-muted-foreground">Saved business lead records</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-4 hover:bg-surface-raised">
                <Checkbox checked={exportSearches} onCheckedChange={setExportSearches} />
                <span>
                  <b className="block">Searches</b>
                  <span className="text-xs text-muted-foreground">
                    Saved search history records
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {exportLeads && (
                <ColumnPicker
                  title="Lead columns"
                  columns={LEAD_COLUMNS}
                  selected={leadColumns}
                  setSelected={setLeadColumns}
                />
              )}
              {exportSearches && (
                <ColumnPicker
                  title="Search columns"
                  columns={SEARCH_COLUMNS}
                  selected={searchColumns}
                  setSelected={setSearchColumns}
                />
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                CSV only. If both datasets are selected, they are combined into one CSV file.
              </p>
              <Button onClick={runExport} disabled={exporting} className="gap-2 rounded-xl">
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {exporting ? "Exporting…" : "Export selected data"}
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
              <div>
                <p className="label-mono text-accent">EXPORT HISTORY</p>
                <h2 className="mt-1 text-lg font-bold">Previous exports</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Exports completed so far, newest first.
                </p>
              </div>
              <FileDown className="size-5 text-muted-foreground" />
            </div>
            {history.loading ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Loading export history…
              </p>
            ) : exports.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No exports recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["Time", "User", "Type", "Search / range", "Rows", "File", ""].map((h) => (
                        <th key={h || "action"} className="label-mono px-5 py-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exports.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() =>
                          adminApi.replayExport(item.id).catch((err) => setError(err.message))
                        }
                        className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-primary/[0.03]"
                      >
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {formatTimestamp(item.createdAt)}
                        </td>
                        <td className="px-5 py-4 font-medium">{item.userEmail || "—"}</td>
                        <td className="px-5 py-4 capitalize">{item.scope}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {item.searchLabel || item.range || "All data"}
                        </td>
                        <td className="px-5 py-4 font-mono">{item.rowCount ?? "—"}</td>
                        <td className="max-w-[360px] px-5 py-4 text-xs text-muted-foreground">
                          {item.filename || "—"}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 rounded-lg"
                            onClick={(event) => {
                              event.stopPropagation();
                              adminApi.replayExport(item.id).catch((err) => setError(err.message));
                            }}
                          >
                            <Download className="size-3.5" /> Export
                          </Button>
                        </td>
                      </tr>
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
