import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Trash2,
  UserRound,
  FileText,
  Search as SearchIcon,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import {} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Navigate, Link, usePath } from "@/router/Router";

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

function getUserId(path) {
  const match = path.match(/^\/admin\/users\/([^/]+)$/);
  return match?.[1] || null;
}

export function UserPanelPage() {
  useDocumentTitle("User management");
  const path = usePath();
  const { user, loading } = useAuth();
  const userId = getUserId(path);
  const [history, setHistory] = useState({ loading: true, data: null, error: null });
  const [action, setAction] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [selectedLeads, setSelectedLeads] = useState({ loading: false, data: null, error: null });
  const [password, setPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLeads, setExportLeads] = useState(true);
  const [exportSearches, setExportSearches] = useState(true);

  const canManage = !!user && (user.is_superuser || user.role === "lead");
  const isAdmin = !!user?.is_superuser;

  useEffect(() => {
    if (!userId || !canManage) return;
    setHistory({ loading: true, data: null, error: null });
    adminApi
      .getUserSearches(userId)
      .then((data) => setHistory({ loading: false, data, error: null }))
      .catch((err) => setHistory({ loading: false, data: null, error: err.message }));
  }, [userId, canManage]);

  const filteredSearches = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() : null;
    return (history.data?.searches || []).filter((search) => {
      const value = new Date(search.createdAt).getTime();
      if (from && value < from) return false;
      if (to && value > to) return false;
      return true;
    });
  }, [history.data, dateFrom, dateTo]);

  async function retrieveSearch(search) {
    if (selectedSearch === search.id) {
      setSelectedSearch(null);
      setSelectedLeads({ loading: false, data: null, error: null });
      return;
    }
    setSelectedSearch(search.id);
    setSelectedLeads({ loading: true, data: null, error: null });
    try {
      const data = await adminApi.getSearchLeads(search.id);
      setSelectedLeads({ loading: false, data, error: null });
    } catch (err) {
      setSelectedLeads({ loading: false, data: null, error: err.message });
    }
  }

  async function exportData(scope, format = "csv", searchId = null) {
    setAction(`export-${scope}-${format}`);
    setError(null);
    try {
      if (searchId && scope === "leads") {
        await adminApi.exportSearchLeadsCsv(searchId);
      } else {
        await adminApi.exportHistory({
          userId,
          scope,
          format,
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        });
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setAction(null);
    }
  }

  async function confirmAction() {
    if (!password) {
      setError("Enter the current account password to continue.");
      return;
    }
    setAction(confirmOpen);
    setError(null);
    try {
      if (confirmOpen === "clear") {
        await adminApi.clearAllData({ userId, password });
      } else if (confirmOpen === "remove") {
        await adminApi.deleteUser(userId, password);
      }
      setConfirmOpen(null);
      setPassword("");
      setSelectedSearch(null);
      setSelectedLeads({ loading: false, data: null, error: null });
      if (confirmOpen === "remove") {
        window.history.pushState({}, "", "/admin");
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }
      const data = await adminApi.getUserSearches(userId);
      setHistory({ loading: false, data, error: null });
    } catch (err) {
      setError(err.message);
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  if (!canManage) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto size-9 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-bold">Management access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This user panel is available to Admin and Lead accounts.
          </p>
          <Button asChild className="mt-5">
            <Link to="/">Back to search</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!userId) return <Navigate to="/admin" />;

  const target = history.data?.user;
  const isRemoving = action === "remove";
  const isClearing = action === "clear";

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="User Panel" subtitle="USER MANAGEMENT" />

      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8 lg:py-10">
          <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
            <div className="relative p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-accent/10 blur-3xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <UserRound className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="label-mono text-accent">SELECTED USER</p>
                    <h1 className="mt-1 truncate font-display text-2xl font-bold">
                      {target?.fullName || target?.email || "Loading user…"}
                    </h1>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {target?.email || "Loading…"}
                    </p>
                  </div>
                  {target && (
                    <Badge variant={target.role === "lead" ? "secondary" : "outline"}>
                      {target.role === "admin" ? "Admin" : target.role === "lead" ? "Lead" : "User"}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Joined {formatTimestamp(target?.createdAt)}
                </div>
              </div>
            </div>
          </section>

          {error && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <section className="mb-8 rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Export data</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the data sets to export. Both are selected by default and downloads are CSV
                  only.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 p-5">
              <div className="space-y-1.5">
                <span className="label-mono block">From</span>
                <input
                  type="datetime-local"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="field field-focus h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <span className="label-mono block">To</span>
                <input
                  type="datetime-local"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="field field-focus h-9 text-sm"
                />
              </div>
              <Button
                variant="outline"
                disabled={action !== null}
                className="gap-2 rounded-xl"
                onClick={() => setExportOpen(true)}
              >
                <Download className="size-4" />
                {action?.startsWith("export-") ? "Exporting…" : "Export data"}
              </Button>
            </div>
          </section>

          <section className="mb-8 rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Saved search history</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Retrieve any saved search to inspect and export its exact leads as CSV.
                </p>
              </div>
              <span className="label-mono">{filteredSearches.length} shown</span>
            </div>

            {history.loading ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Loading user history…
              </p>
            ) : history.error ? (
              <p className="px-5 py-10 text-center text-sm text-destructive">{history.error}</p>
            ) : filteredSearches.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No saved searches match the selected date range.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filteredSearches.map((search) => (
                  <div key={search.id}>
                    <button
                      type="button"
                      onClick={() => retrieveSearch(search)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-raised"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {search.category} · {search.location}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatTimestamp(search.createdAt)}</span>
                          <span>{search.scanned} scanned</span>
                          <span>{search.leadCount} saved leads</span>
                        </p>
                      </div>
                      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                    </button>

                    {selectedSearch === search.id && (
                      <div className="border-t border-border bg-surface-raised/40">
                        {selectedLeads.loading ? (
                          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                            Retrieving saved leads…
                          </p>
                        ) : selectedLeads.error ? (
                          <p className="px-5 py-8 text-center text-sm text-destructive">
                            {selectedLeads.error}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                              <span className="text-sm font-medium">
                                {selectedLeads.data?.leads?.length || 0} leads
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={action !== null || !selectedLeads.data?.leads?.length}
                                onClick={() => exportData("leads", "csv", search.id)}
                                className="gap-2"
                              >
                                <FileText className="size-4" /> Export this search
                              </Button>
                            </div>
                            <table className="w-full min-w-[900px] border-collapse text-sm">
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
                                    <th key={head} className="label-mono px-4 py-3 text-left">
                                      {head}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(selectedLeads.data?.leads || []).map((lead) => (
                                  <tr
                                    key={lead.placeId}
                                    className="border-b border-border/60 last:border-0"
                                  >
                                    <td className="px-4 py-3 font-medium">{lead.name || "—"}</td>
                                    <td className="max-w-sm px-4 py-3 text-xs">
                                      {lead.address || "—"}
                                    </td>
                                    <td className="px-4 py-3 text-xs">{lead.phone || "—"}</td>
                                    <td className="max-w-sm px-4 py-3 text-xs">
                                      {lead.website || "—"}
                                    </td>
                                    <td className="px-4 py-3">{lead.rating ?? "—"}</td>
                                    <td className="px-4 py-3">{lead.reviews ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-destructive/20 bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">User data operations</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAdmin ? "Destructive operations require the signed-in operator's password and are recoverable for 3 days." : "Leads can review and export user data. Destructive and recovery operations are Admin-only."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 p-5">
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setConfirmOpen("clear");
                      setPassword("");
                      setError(null);
                    }}
                  >
                    <Trash2 className="size-4" /> Clear saved data
                  </Button>
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={() => {
                      setConfirmOpen("remove");
                      setPassword("");
                      setError(null);
                    }}
                  >
                    <Trash2 className="size-4" /> Remove user
                  </Button>
                </>
              )}
              <Button asChild variant="ghost">
                <Link to="/admin/users">
                  <RotateCcw className="mr-2 size-4" /> Back to users
                </Link>
              </Button>
            </div>
          </section>
        </div>

        {exportOpen && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-foreground/20 p-5 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Download className="size-5" />
                </div>
                <div>
                  <h2 className="font-bold">Export data</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Select one or both CSV datasets. Each selected dataset downloads separately.
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-surface-raised">
                  <Checkbox checked={exportLeads} onCheckedChange={setExportLeads} />
                  <span>
                    <span className="block font-semibold">Leads</span>
                    <span className="text-xs text-muted-foreground">
                      Saved business lead records
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-surface-raised">
                  <Checkbox checked={exportSearches} onCheckedChange={setExportSearches} />
                  <span>
                    <span className="block font-semibold">Searches</span>
                    <span className="text-xs text-muted-foreground">
                      Saved search history records
                    </span>
                  </span>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={action !== null}
                  onClick={() => setExportOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={action !== null || (!exportLeads && !exportSearches)}
                  onClick={async () => {
                    setError(null);
                    try {
                      if (exportLeads) await exportData("leads", "csv");
                      if (exportSearches) await exportData("searches", "csv");
                      setExportOpen(false);
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                >
                  <Download className="size-4" /> Export CSV
                </Button>
              </div>
            </div>
          </div>
        )}

        {confirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
              <h2 className="text-lg font-bold">
                {confirmOpen === "clear" ? "Clear this user's data" : "Remove this user"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {confirmOpen === "clear"
                  ? "All saved searches and leads for this user will move to recovery for 3 days."
                  : "The user account and saved data will move to recovery for 3 days."}
              </p>
              <label className="label-mono mt-5 block" htmlFor="user-panel-password">
                Current account password
              </label>
              <input
                id="user-panel-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && confirmAction()}
                className="field field-focus mt-2 w-full"
                placeholder="Enter your password"
                autoFocus
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={action !== null}
                  onClick={() => setConfirmOpen(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant={confirmOpen === "remove" ? "destructive" : "default"}
                  disabled={action !== null || !password}
                  onClick={confirmAction}
                >
                  {action ? <Loader2 className="size-4 animate-spin" /> : null}
                  {action === "clear"
                    ? "Clearing…"
                    : action === "remove"
                      ? "Removing…"
                      : confirmOpen === "clear"
                        ? "Clear data"
                        : "Remove user"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
