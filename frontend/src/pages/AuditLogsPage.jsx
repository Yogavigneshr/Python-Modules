import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Download,
  Filter,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Navigate } from "@/router/Router";

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

function prettyAction(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditLogsPage() {
  useDocumentTitle("Audit logs");
  const { user, loading } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [logColumns, setLogColumns] = useState(["createdAt", "userEmail", "action", "details"]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const isAdmin = !!user?.is_superuser;

  useEffect(() => {
    if (!isAdmin) return;
    adminApi
      .getAuditLogs()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error: error.message }));
  }, [isAdmin]);

  const actions = useMemo(
    () => [...new Set((state.data?.logs || []).map((item) => item.action))].sort(),
    [state.data],
  );
  const logs = useMemo(
    () =>
      (state.data?.logs || []).filter((item) => {
        const q = query.trim().toLowerCase();
        const matchesQuery =
          !q ||
          [item.userEmail, item.actorEmail, item.action, JSON.stringify(item.details || {})]
            .join(" ")
            .toLowerCase()
            .includes(q);
        return matchesQuery && (action === "all" || item.action === action);
      }),
    [state.data, query, action],
  );

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  if (!isAdmin)
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto size-9 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-bold">Audit logs are restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Lead accounts can manage the workspace but cannot view organization-wide audit history.
          </p>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="Audit logs" subtitle="SECURITY · AUDIT TRAIL" />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="label-mono text-accent">IMMUTABLE ACTIVITY</p>
                <h1 className="mt-2 font-display text-3xl font-bold">Audit logs</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Every recorded account, search, export, recovery, role and management action
                  across the workspace.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_220px] lg:max-w-xl">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search users, actors or actions"
                    className="field field-focus h-11 pl-9"
                  />
                </div>
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="field field-focus h-11 appearance-none pl-9"
                  >
                    <option value="all">All actions</option>
                    {actions.map((item) => (
                      <option key={item} value={item}>
                        {prettyAction(item)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="label-mono text-accent">LOG EXPORT</p>
                <h2 className="mt-1 text-lg font-bold">Export audit logs</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose a date range and log fields. Everything starts selected, so an empty date
                  range exports the complete log.
                </p>
              </div>
              <Button
                className="gap-2 rounded-xl"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  setExportError(null);
                  try {
                    await adminApi.exportAuditLogs({ dateFrom, dateTo, columns: logColumns });
                  } catch (err) {
                    setExportError(err.message);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {exporting ? "Exporting…" : "Export logs"}
              </Button>
            </div>
            {exportError && (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {exportError}
              </div>
            )}
            <div className="mt-5 grid gap-3 md:grid-cols-2">
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
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["createdAt", "Time"],
                ["userEmail", "User"],
                ["action", "Action"],
                ["details", "Details"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm hover:bg-surface-raised"
                >
                  <Checkbox
                    checked={logColumns.includes(key)}
                    onCheckedChange={(checked) =>
                      setLogColumns((current) =>
                        checked
                          ? [...new Set([...current, key])]
                          : current.filter((item) => item !== key),
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-bold">Activity stream</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {logs.length} matching events · newest first
                </p>
              </div>
              <Badge variant="outline">Admin only</Badge>
            </div>
            {state.loading ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Loading audit history…
              </p>
            ) : state.error ? (
              <p className="px-6 py-10 text-center text-sm text-destructive">{state.error}</p>
            ) : logs.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No matching audit events.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["Time", "User", "Action", "Performed by", "Details"].map((h) => (
                        <th key={h} className="label-mono px-5 py-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border/60 align-top last:border-0 hover:bg-primary/[0.025]"
                      >
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground">
                          {formatTimestamp(item.createdAt)}
                        </td>
                        <td className="px-5 py-4 font-medium">
                          {item.userEmail || user?.email || "—"}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-lg bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                            {prettyAction(item.action)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {item.actorEmail || "—"}
                        </td>
                        <td className="max-w-[480px] px-5 py-4">
                          <pre className="whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">
                            {JSON.stringify(item.details || {}, null, 2)}
                          </pre>
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
