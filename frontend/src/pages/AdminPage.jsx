// Admin panel: every user's search/lead history in one place, with CSV
// export. Gated to superuser accounts only (see leads/permissions.py's
// IsSuperUser on the backend, and the is_superuser check below).

import { useEffect, useRef, useState } from "react";
import {
  Users,
  Search as SearchIcon,
  ListChecks,
  Activity,
  Download,
  Loader2,
  LogOut,
  ShieldAlert,
  Clock,
  Trash2,
  X,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, Navigate } from "@/router/Router";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

function StatCard({ icon: Icon, label, value, onClick, highlighted }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border bg-surface p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm ${
        highlighted ? "border-primary ring-2 ring-primary/40" : "border-border"
      }`}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </div>
      <div>
        <div className="text-xl font-bold leading-tight">{value}</div>
        <div className="label-mono text-muted-foreground">{label}</div>
      </div>
    </button>
  );
}

export function AdminPage() {
  useDocumentTitle("Admin panel");

  const { user, loading, signOut } = useAuth();

  const [overview, setOverview] = useState({ loading: true, data: null, error: null });
  const [users, setUsers] = useState({ loading: true, data: null, error: null });
  const [exportingKey, setExportingKey] = useState(null);
  const [exportError, setExportError] = useState(null);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userHistory, setUserHistory] = useState({ loading: false, data: null, error: null });

  // "all" | "user" | null - which clear action (if any) is in flight, so
  // the "clear all" and "clear this user" buttons can show independent
  // loading/disabled states instead of one shared flag.
  const [clearingKey, setClearingKey] = useState(null);
  const [clearError, setClearError] = useState(null);
  const [clearDataTarget, setClearDataTarget] = useState(null);
  const [clearDataScope, setClearDataScope] = useState(null); // "user" | "all"
  const [clearDataPassword, setClearDataPassword] = useState("");
  const [clearDataLoading, setClearDataLoading] = useState(false);

  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [deleteUserPassword, setDeleteUserPassword] = useState("");
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState(null);

  const [recovery, setRecovery] = useState({ loading: true, data: null, error: null });
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreError, setRestoreError] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // --- Stat cards -> jump to & filter the relevant section below -------
  const usersSectionRef = useRef(null);
  const recentSearchesRef = useRef(null);
  const exportSectionRef = useRef(null);

  const [usersFilter, setUsersFilter] = useState(null); // null | "new7d"
  const [usersView, setUsersView] = useState("active"); // "active" | "recovery"
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [recentSearchesFilter, setRecentSearchesFilter] = useState(null); // null | "7d"
  const [highlightSection, setHighlightSection] = useState(null); // "users" | "recent" | "export"
  const [focusTarget, setFocusTarget] = useState(null);

  useEffect(() => {
    if (!focusTarget) return undefined;
    const refMap = { users: usersSectionRef, recent: recentSearchesRef, export: exportSectionRef };
    const ref = refMap[focusTarget.section];
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    setHighlightSection(focusTarget.section);
    const timeout = window.setTimeout(() => setHighlightSection(null), 1600);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [focusTarget]);

  function focusUsers(filter) {
    setUsersFilter(filter);
    setFocusTarget({ section: "users", ts: Date.now() });
  }

  function focusRecentSearches(filter) {
    setShowRecentSearches(true);
    setRecentSearchesFilter(filter);
    setFocusTarget({ section: "recent", ts: Date.now() });
  }

  function focusExport() {
    setFocusTarget({ section: "export", ts: Date.now() });
  }

  // --- Main export workspace ------------------------------------------
  const [exportUserId, setExportUserId] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportHistory, setExportHistory] = useState({ loading: false, data: null, error: null });
  const [exportSelectedSearchId, setExportSelectedSearchId] = useState(null);
  const [exportPreview, setExportPreview] = useState({ loading: false, data: null, error: null });

  function clearExportPreview() {
    setExportSelectedSearchId(null);
    setExportPreview({ loading: false, data: null, error: null });
  }

  async function loadExportHistory(userId) {
    if (!userId) {
      setExportHistory({ loading: false, data: null, error: null });
      clearExportPreview();
      return;
    }
    setExportHistory({ loading: true, data: null, error: null });
    clearExportPreview();
    try {
      const data = await adminApi.getUserSearches(userId);
      setExportHistory({ loading: false, data, error: null });
    } catch (error) {
      setExportHistory({ loading: false, data: null, error: error.message });
    }
  }

  const filteredExportHistory = (exportHistory.data?.searches ?? []).filter((search) => {
    const created = new Date(search.createdAt).getTime();
    if (Number.isNaN(created)) return false;
    if (exportDateFrom && created < new Date(exportDateFrom).getTime()) return false;
    if (exportDateTo && created > new Date(exportDateTo).getTime()) return false;
    return true;
  });

  async function selectExportHistory(search) {
    if (exportSelectedSearchId === search.id) {
      clearExportPreview();
      return;
    }

    setExportSelectedSearchId(search.id);
    setExportPreview({ loading: true, data: null, error: null });
    try {
      // Read the exact saved search and its saved leads. This intentionally
      // uses Search History as the source of truth instead of rebuilding a
      // lead query from category/location/date filters.
      const data = await adminApi.getSearchLeads(search.id);
      const columns = [
        { key: "userEmail", label: "User Email" },
        { key: "category", label: "Search Category" },
        { key: "location", label: "Search Location" },
        { key: "name", label: "Business Name" },
        { key: "address", label: "Address" },
        { key: "phone", label: "Phone" },
        { key: "website", label: "Website" },
        { key: "rating", label: "Rating" },
        { key: "reviews", label: "Reviews" },
        { key: "rank", label: "Rank" },
        { key: "createdAt", label: "Searched At" },
      ];
      const rows = (data.leads ?? []).map((lead) => ({
        userEmail: data.createdByEmail || exportHistory.data?.user?.email || "",
        category: data.category || "",
        location: data.location || "",
        name: lead.name || "",
        address: lead.address || "",
        phone: lead.phone || "",
        website: lead.website || "",
        rating: lead.rating ?? "",
        reviews: lead.reviews ?? "",
        rank: lead.rank ?? "",
        createdAt: lead.createdAt || data.createdAt || "",
      }));
      setExportPreview({
        loading: false,
        error: null,
        data: {
          count: rows.length,
          previewCount: rows.length,
          truncated: false,
          columns,
          rows,
          search: {
            id: data.id,
            category: data.category,
            location: data.location,
            createdAt: data.createdAt,
            scanned: data.scanned,
            leadCount: rows.length,
          },
        },
      });
    } catch (error) {
      setExportPreview({ loading: false, data: null, error: error.message });
    }
  }

  function csvCell(value) {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportRetrievedData() {
    const data = exportPreview.data;
    if (!data || !data.rows?.length) return;

    setExportingKey("filtered-export");
    try {
      // Export exactly the rows that were returned by Retrieve data.
      // No API call is made here, so the downloaded CSV cannot diverge
      // from the preview dataset.
      const header = data.columns.map((column) => csvCell(column.label)).join(",");
      const body = data.rows.map((row) =>
        data.columns.map((column) => csvCell(row[column.key])).join(","),
      );
      const csv = `\ufeff${[header, ...body].join("\r\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `leadfinder_selected_data_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingKey(null);
    }
  }

  const isAdmin = !!user && user.is_superuser;

  function reloadOverviewAndUsers() {
    setOverview({ loading: true, data: null, error: null });
    setUsers({ loading: true, data: null, error: null });
    adminApi
      .getOverview()
      .then((data) => setOverview({ loading: false, data, error: null }))
      .catch((error) => setOverview({ loading: false, data: null, error: error.message }));
    adminApi
      .getUsers()
      .then((data) => setUsers({ loading: false, data, error: null }))
      .catch((error) => setUsers({ loading: false, data: null, error: error.message }));
  }

  function openClearData(target) {
    setClearDataScope(target ? "user" : "all");
    setClearDataTarget(target || null);
    setClearDataPassword("");
    setClearError(null);
  }

  function closeClearData() {
    if (clearDataLoading) return;
    setClearDataTarget(null);
    setClearDataScope(null);
    setClearDataPassword("");
    setClearError(null);
  }

  async function handleClearData() {
    if (!clearDataPassword) {
      setClearError("Enter your admin password to continue.");
      return;
    }

    const target = clearDataTarget;
    setClearDataLoading(true);
    setClearingKey(clearDataScope);
    setClearError(null);
    try {
      await adminApi.clearAllData({
        password: clearDataPassword,
        ...(target?.userId ? { userId: target.userId } : {}),
      });
      setClearDataTarget(null);
      setClearDataScope(null);
      setClearDataPassword("");
      setClearError(null);
      setSelectedUserId(null);
      setUserHistory({ loading: false, data: null, error: null });
      setExportUserId("");
      setExportHistory({ loading: false, data: null, error: null });
      clearExportPreview();
      reloadOverviewAndUsers();
    } catch (err) {
      setClearError(err.message);
    } finally {
      setClearDataLoading(false);
      setClearingKey(null);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    adminApi
      .getOverview()
      .then((data) => setOverview({ loading: false, data, error: null }))
      .catch((error) => setOverview({ loading: false, data: null, error: error.message }));
    adminApi
      .getUsers()
      .then((data) => setUsers({ loading: false, data, error: null }))
      .catch((error) => setUsers({ loading: false, data: null, error: error.message }));
    loadRecovery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function selectUser(userId) {
    setSelectedSearchId(null);
    setSearchLeads({ loading: false, data: null, error: null });
    if (selectedUserId === userId) {
      setSelectedUserId(null);
      return;
    }
    setSelectedUserId(userId);
    setUserHistory({ loading: true, data: null, error: null });
    adminApi
      .getUserSearches(userId)
      .then((data) => setUserHistory({ loading: false, data, error: null }))
      .catch((error) => setUserHistory({ loading: false, data: null, error: error.message }));
  }

  function openDeleteUser(target) {
    setDeleteUserTarget(target);
    setDeleteUserPassword("");
    setDeleteUserError(null);
  }

  function closeDeleteUser() {
    if (deleteUserLoading) return;
    setDeleteUserTarget(null);
    setDeleteUserPassword("");
    setDeleteUserError(null);
  }

  async function handleDeleteUser() {
    if (!deleteUserTarget || !deleteUserPassword) {
      setDeleteUserError("Enter your admin password to continue.");
      return;
    }

    setDeleteUserLoading(true);
    setDeleteUserError(null);
    try {
      await adminApi.deleteUser(deleteUserTarget.id, deleteUserPassword);
      setDeleteUserTarget(null);
      setDeleteUserPassword("");
      setSelectedUserId(null);
      setUserHistory({ loading: false, data: null, error: null });
      reloadOverviewAndUsers();
    } catch (err) {
      setDeleteUserError(err.message);
    } finally {
      setDeleteUserLoading(false);
    }
  }

  async function handleExport(key, options) {
    setExportingKey(key);
    setExportError(null);
    try {
      await adminApi.exportHistory(options);
    } catch (err) {
      console.error("Admin export failed:", err);
      setExportError(err?.message || "Export failed. Please try again.");
    } finally {
      setExportingKey(null);
    }
  }

  async function loadRecovery() {
    setRecovery({ loading: true, data: null, error: null });
    try {
      const data = await adminApi.getRecoveryItems();
      setRecovery({ loading: false, data, error: null });
    } catch (err) {
      setRecovery({ loading: false, data: null, error: err.message });
    }
  }

  function openRestore(item) {
    setRestoreTarget(item);
    setRestorePassword("");
    setRestoreError(null);
  }

  async function handleRestore() {
    if (!restoreTarget || !restorePassword) {
      setRestoreError("Enter your admin password to recover this data.");
      return;
    }
    setRestoreLoading(true);
    setRestoreError(null);
    try {
      await adminApi.restoreRecovery(restoreTarget.id, restorePassword);
      setRestoreTarget(null);
      setRestorePassword("");
      await loadRecovery();
      reloadOverviewAndUsers();
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setRestoreLoading(false);
    }
  }

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

  if (!isAdmin) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-5 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-bold">Admins only</h1>
        <p className="text-sm text-muted-foreground">
          Your account doesn't have access to the admin panel.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to Search</Link>
        </Button>
      </main>
    );
  }

  const selectedUser = users.data?.users?.find((u) => u.id === selectedUserId);
  const filteredUsers = (users.data?.users ?? []).filter((u) => {
    if (usersFilter === "new7d") {
      return Date.now() - new Date(u.createdAt).getTime() <= SEVEN_DAYS_MS;
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Activity className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display truncate text-sm font-bold tracking-tight">Admin Panel</p>
              <p className="label-mono text-accent">ADMIN HOME</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="gap-2 rounded-xl px-4 shadow-sm">
              <Link to="/search">
                <SearchIcon className="size-4" />
                Search engine
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl"
              onClick={() => signOut()}
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8 lg:py-10">
        <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-medium text-accent">
                  <span className="size-1.5 rounded-full bg-accent" />
                  System overview
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  Good to see you.
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Manage users, monitor searches, review lead activity, and export your data from
                  one clean workspace.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                <Button asChild size="lg" className="h-12 rounded-xl px-5 shadow-sm">
                  <Link to="/search" className="gap-2">
                    <SearchIcon className="size-5" />
                    Open search engine
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-xl"
                  disabled={exportingKey !== null}
                  onClick={() =>
                    handleExport("system-export", {
                      scope: "leads",
                      format: "csv",
                    })
                  }
                >
                  {exportingKey === "system-export" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {exportingKey === "system-export" ? "Exporting…" : "Export all data"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-xl"
                  disabled={clearingKey !== null}
                  onClick={() => openClearData(null)}
                >
                  {clearingKey === "all" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {clearingKey === "all" ? "Clearing…" : "Clear all data"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {clearError && <p className="mb-4 text-sm text-destructive">{clearError}</p>}
        {overview.error && <p className="mb-4 text-sm text-destructive">{overview.error}</p>}
        {exportError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span>Export failed: {exportError}</span>
            <button
              type="button"
              onClick={() => setExportError(null)}
              aria-label="Dismiss export error"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={Users}
            label="Total users"
            value={overview.data?.totalUsers ?? "—"}
            highlighted={highlightSection === "users" && usersFilter === null}
            onClick={() => focusUsers(null)}
          />
          <StatCard
            icon={SearchIcon}
            label="Total searches"
            value={overview.data?.totalSearches ?? "—"}
            highlighted={highlightSection === "recent" && recentSearchesFilter === null}
            onClick={() => focusRecentSearches(null)}
          />
          <StatCard
            icon={ListChecks}
            label="Total leads saved"
            value={overview.data?.totalLeads ?? "—"}
            highlighted={highlightSection === "export"}
            onClick={() => focusExport()}
          />
        </section>

        {showRecentSearches && (
          <section
            ref={recentSearchesRef}
            className={`mb-8 rounded-xl border bg-surface transition-shadow ${
              highlightSection === "recent"
                ? "border-primary ring-2 ring-primary/40"
                : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Recent searches</h2>
                <p className="text-xs text-muted-foreground">
                  {recentSearchesFilter === "7d"
                    ? "From the last 7 days, most recent first"
                    : "Most recent across all users"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setRecentSearchesFilter(null)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      recentSearchesFilter === null
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentSearchesFilter("7d")}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      recentSearchesFilter === "7d"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Last 7d
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRecentSearches(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                  aria-label="Hide recent searches"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {overview.loading && (
              <p className="px-5 py-8 text-sm text-muted-foreground">Loading…</p>
            )}

            {!overview.loading &&
              (() => {
                const cutoff = Date.now() - SEVEN_DAYS_MS;
                const rows = (overview.data?.recentSearches ?? []).filter(
                  (s) => recentSearchesFilter !== "7d" || new Date(s.createdAt).getTime() >= cutoff,
                );
                if (rows.length === 0) {
                  return (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No searches {recentSearchesFilter === "7d" ? "in the last 7 days" : "yet"}.
                    </p>
                  );
                }
                return (
                  <ul className="divide-y divide-border">
                    {rows.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div>
                          <div className="text-sm font-medium">
                            {s.category} · {s.location}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{s.userEmail}</div>
                        </div>
                        <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {formatTimestamp(s.createdAt)} · {s.scanned} scanned
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
          </section>
        )}

        <section
          ref={exportSectionRef}
          className={`mb-8 rounded-xl border bg-surface transition-shadow ${
            highlightSection === "export"
              ? "border-primary ring-2 ring-primary/40"
              : "border-border"
          }`}
        >
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-bold">Data export</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a user, choose a saved search from their history, then review and export
              exactly the leads saved under that history.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 p-5">
            <div className="space-y-1.5">
              <span className="label-mono block">User</span>
              <Select
                value={exportUserId}
                onValueChange={(value) => {
                  setExportUserId(value);
                  loadExportHistory(value);
                }}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {(users.data?.users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="label-mono block">From</span>
              <input
                type="datetime-local"
                value={exportDateFrom}
                onChange={(e) => {
                  setExportDateFrom(e.target.value);
                  clearExportPreview();
                }}
                className="field field-focus h-9 w-52 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <span className="label-mono block">To</span>
              <input
                type="datetime-local"
                value={exportDateTo}
                onChange={(e) => {
                  setExportDateTo(e.target.value);
                  clearExportPreview();
                }}
                className="field field-focus h-9 w-52 text-sm"
              />
            </div>

            {exportUserId && (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={exportHistory.loading}
                onClick={() => loadExportHistory(exportUserId)}
              >
                {exportHistory.loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <SearchIcon className="size-4" />
                )}
                Load history
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-9"
              disabled={
                exportingKey !== null || !exportPreview.data || exportPreview.data.count === 0
              }
              onClick={exportRetrievedData}
            >
              {exportingKey === "filtered-export" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export retrieved data
            </Button>
          </div>

          {exportHistory.error && (
            <p className="px-5 pb-4 text-sm text-destructive">{exportHistory.error}</p>
          )}
          {exportPreview.error && (
            <p className="px-5 pb-4 text-sm text-destructive">{exportPreview.error}</p>
          )}

          {!exportUserId ? (
            <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
              Select a user to view their saved search history.
            </p>
          ) : exportHistory.loading ? (
            <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
              Loading search history…
            </p>
          ) : (
            <div className="border-t border-border">
              <div className="px-5 py-3">
                <div className="text-sm font-medium">Saved search history</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Select a category/search below to retrieve the leads saved for that exact search.
                </div>
              </div>

              {filteredExportHistory.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No saved search history matches the selected date range.
                </p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {filteredExportHistory.map((search) => (
                    <li key={search.id}>
                      <button
                        type="button"
                        onClick={() => selectExportHistory(search)}
                        className={`flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-surface-raised ${
                          exportSelectedSearchId === search.id ? "bg-surface-raised" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {search.category} · {search.location}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="size-3" /> {formatTimestamp(search.createdAt)}
                            </span>
                            <span>{search.scanned} scanned</span>
                            <span>{search.leadCount} saved leads</span>
                          </div>
                        </div>
                        <ChevronRight
                          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                            exportSelectedSearchId === search.id ? "rotate-90" : ""
                          }`}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {exportPreview.loading && exportSelectedSearchId && (
                <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
                  Retrieving saved leads…
                </p>
              )}

              {exportPreview.data && (
                <div className="border-t border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <div className="text-sm font-medium">
                        {exportPreview.data.search?.category} ·{" "}
                        {exportPreview.data.search?.location}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {exportPreview.data.count.toLocaleString()} saved leads ·{" "}
                        {formatTimestamp(exportPreview.data.search?.createdAt)}
                      </div>
                    </div>
                    <span className="label-mono text-primary">Selected history</span>
                  </div>

                  {exportPreview.data.count === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                      This saved search has no leads.
                    </p>
                  ) : (
                    <div className="max-h-[520px] overflow-auto border-t border-border">
                      <table className="w-full min-w-[1100px] border-collapse text-sm">
                        <thead className="sticky top-0 bg-surface">
                          <tr className="border-b border-border">
                            {exportPreview.data.columns.map((column) => (
                              <th
                                key={column.key}
                                className="label-mono whitespace-nowrap px-4 py-3 text-left font-semibold"
                              >
                                {column.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {exportPreview.data.rows.map((row, index) => (
                            <tr
                              key={`${row.placeId || row.name}-${index}`}
                              className="border-b border-border/60 align-top last:border-0"
                            >
                              {exportPreview.data.columns.map((column) => (
                                <td key={column.key} className="max-w-xs px-4 py-3 text-xs">
                                  {column.key === "createdAt"
                                    ? formatTimestamp(row[column.key]) || "—"
                                    : String(row[column.key] ?? "—")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section
          ref={usersSectionRef}
          className={`mb-8 rounded-xl border bg-surface transition-shadow ${
            highlightSection === "users" ? "border-primary ring-2 ring-primary/40" : "border-border"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised/40 p-1">
              <button
                type="button"
                onClick={() => setUsersView("active")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  usersView === "active"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsersView("recovery");
                  loadRecovery();
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  usersView === "recovery"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Recently deleted
              </button>
            </div>
            {usersView === "active" ? (
              <p className="label-mono">
                {usersFilter
                  ? `${filteredUsers.length} of ${users.data?.users?.length ?? 0}`
                  : (users.data?.users?.length ?? 0)}{" "}
                total
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={loadRecovery}
                disabled={recovery.loading}
              >
                {recovery.loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Refresh
              </Button>
            )}
          </div>

          {usersView === "recovery" ? (
            <div>
              <div className="border-b border-border px-5 py-3">
                <p className="text-sm text-muted-foreground">
                  Recover deleted users and data from the last 3 days.
                </p>
              </div>
              {recovery.error && (
                <p className="px-5 py-4 text-sm text-destructive">{recovery.error}</p>
              )}
              {recovery.loading ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Loading recovery items…
                </p>
              ) : !recovery.data?.items?.length ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nothing is waiting for recovery.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-raised/60">
                        {[
                          "Deleted item",
                          "User",
                          "Deleted at",
                          "Recover until",
                          "Searches",
                          "Leads",
                          "Action",
                        ].map((h) => (
                          <th key={h} className="label-mono px-4 py-3 text-left font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recovery.data.items.map((item) => (
                        <tr key={item.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3 font-medium">{item.label}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {item.userEmail || "All users"}
                          </td>
                          <td className="px-4 py-3 text-xs">{formatTimestamp(item.deletedAt)}</td>
                          <td className="px-4 py-3 text-xs">{formatTimestamp(item.expiresAt)}</td>
                          <td className="px-4 py-3">{item.searchCount}</td>
                          <td className="px-4 py-3">{item.leadCount}</td>
                          <td className="px-4 py-3">
                            <Button size="sm" onClick={() => openRestore(item)}>
                              <RotateCcw className="size-4" />
                              Recover
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <>
              {usersFilter === "new7d" && (
                <div className="flex items-center justify-between border-b border-border bg-primary/5 px-5 py-2 text-xs">
                  <span className="font-medium text-primary">
                    Showing users joined in the last 7 days
                  </span>
                  <button
                    type="button"
                    onClick={() => setUsersFilter(null)}
                    className="text-primary hover:underline"
                  >
                    Clear filter
                  </button>
                </div>
              )}

              {users.loading && (
                <p className="px-5 py-8 text-sm text-muted-foreground">Loading users…</p>
              )}
              {users.error && <p className="px-5 py-8 text-sm text-destructive">{users.error}</p>}

              {!users.loading && !users.error && filteredUsers.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No users joined in the last 7 days.
                </p>
              )}

              {!users.loading && !users.error && filteredUsers.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-raised/60">
                        {[
                          "Email",
                          "Role",
                          "Joined",
                          "Searches",
                          "Leads saved",
                          "Last active",
                          "Actions",
                        ].map((h) => (
                          <th key={h} className="label-mono px-4 py-3 text-left font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          onClick={() => selectUser(u.id)}
                          className={`cursor-pointer border-b border-border/60 last:border-0 transition-colors hover:bg-primary/[0.04] ${
                            selectedUserId === u.id ? "bg-primary/[0.06]" : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-medium">{u.email}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              {u.isSuperuser && <Badge variant="default">Superuser</Badge>}
                              {u.isStaff && !u.isSuperuser && (
                                <Badge variant="secondary">Staff</Badge>
                              )}
                              {!u.isStaff && !u.isSuperuser && (
                                <Badge variant="outline">User</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatTimestamp(u.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-mono">{u.searchCount}</td>
                          <td className="px-4 py-3 font-mono">{u.leadCount}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatTimestamp(u.lastSearchAt) || "Never searched"}
                          </td>
                          <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg border-primary/25 bg-white font-medium text-primary hover:bg-primary/5"
                                disabled={clearingKey !== null || deleteUserLoading}
                                onClick={() => openClearData({ userId: u.id, email: u.email })}
                              >
                                {clearingKey === "user" && clearDataTarget?.userId === u.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                                User data
                              </Button>
                              {!u.isSuperuser && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-8 rounded-lg"
                                  disabled={clearingKey !== null || deleteUserLoading}
                                  onClick={() => openDeleteUser(u)}
                                >
                                  {deleteUserLoading && deleteUserTarget?.id === u.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="size-3.5" />
                                  )}
                                  Remove user
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {selectedUserId && (
          <section className="mb-8 rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">
                Search history ·{" "}
                <span className="text-muted-foreground">{selectedUser?.email}</span>
              </h2>
              {selectedUserId && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportingKey !== null}
                    onClick={() =>
                      handleExport(`user-leads-${selectedUserId}`, {
                        scope: "leads",
                        format: "csv",
                        userId: selectedUserId,
                      })
                    }
                  >
                    {exportingKey === `user-leads-${selectedUserId}` ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Export this user's leads
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportingKey !== null}
                    onClick={() =>
                      handleExport(`user-searches-${selectedUserId}`, {
                        scope: "searches",
                        format: "csv",
                        userId: selectedUserId,
                      })
                    }
                  >
                    {exportingKey === `user-searches-${selectedUserId}` ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Export this user's search history
                  </Button>
                  {!selectedUser?.isSuperuser && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={clearingKey !== null || deleteUserLoading}
                      onClick={() => openDeleteUser(selectedUser)}
                    >
                      <Trash2 className="size-4" />
                      Remove user
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={clearingKey !== null}
                    onClick={() =>
                      openClearData({ userId: selectedUserId, email: selectedUser?.email })
                    }
                  >
                    {clearingKey === "user" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    {clearingKey === "user" ? "Clearing…" : "Clear this user's data"}
                  </Button>
                </div>
              )}
            </div>

            {userHistory.loading && (
              <p className="px-5 py-8 text-sm text-muted-foreground">Loading search history…</p>
            )}
            {userHistory.error && (
              <p className="px-5 py-8 text-sm text-destructive">{userHistory.error}</p>
            )}

            {!userHistory.loading && !userHistory.error && (
              <>
                {userHistory.data?.searches?.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    This user hasn't run any searches yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {userHistory.data?.searches?.map((s) => (
                      <li key={s.id} className="px-5 py-3">
                        <div>
                          <div className="text-sm font-medium">
                            {s.category} · {s.location}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {formatTimestamp(s.createdAt)} · {s.scanned} scanned · {s.leadCount}{" "}
                            saved
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}

        {restoreTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Recover deleted data</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recover{" "}
                    <span className="font-medium text-foreground">{restoreTarget.label}</span> and
                    put it back into the Users/Search History data.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRestoreTarget(null)}
                  disabled={restoreLoading}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-5 space-y-2">
                <label htmlFor="restore-password" className="label-mono block">
                  Admin password
                </label>
                <input
                  id="restore-password"
                  type="password"
                  autoComplete="current-password"
                  value={restorePassword}
                  onChange={(e) => {
                    setRestorePassword(e.target.value);
                    setRestoreError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !restoreLoading) handleRestore();
                  }}
                  placeholder="Enter your current admin password"
                  disabled={restoreLoading}
                  className="field field-focus h-10 w-full"
                  autoFocus
                />
                {restoreError && <p className="text-sm text-destructive">{restoreError}</p>}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRestoreTarget(null)}
                  disabled={restoreLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleRestore} disabled={restoreLoading || !restorePassword}>
                  {restoreLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  {restoreLoading ? "Recovering…" : "Recover data"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {clearDataScope && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">
                    {clearDataScope === "user" ? "Clear this user's data" : "Clear all data"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {clearDataScope === "user" ? (
                      <>
                        This moves every saved search and lead for{" "}
                        <span className="font-medium text-foreground">
                          {clearDataTarget?.email}
                        </span>{" "}
                        to recovery for 3 days.
                      </>
                    ) : (
                      "This moves every saved search and lead for every user to recovery for 3 days."
                    )}
                    <span className="block mt-1 font-medium text-primary">
                      The deleted data can be recovered within 3 days.
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeClearData}
                  disabled={clearDataLoading}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-5 space-y-2">
                <label htmlFor="clear-data-password" className="label-mono block">
                  Admin password
                </label>
                <input
                  id="clear-data-password"
                  type="password"
                  autoComplete="current-password"
                  value={clearDataPassword}
                  onChange={(e) => {
                    setClearDataPassword(e.target.value);
                    setClearError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !clearDataLoading) handleClearData();
                  }}
                  placeholder="Enter your current admin password"
                  disabled={clearDataLoading}
                  className="field field-focus h-10 w-full"
                  autoFocus
                />
                {clearError && <p className="text-sm text-destructive">{clearError}</p>}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={closeClearData} disabled={clearDataLoading}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleClearData}
                  disabled={clearDataLoading || !clearDataPassword}
                >
                  {clearDataLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {clearDataLoading ? "Clearing…" : "Clear data"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {deleteUserTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Remove user</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This moves{" "}
                    <span className="font-medium text-foreground">{deleteUserTarget.email}</span>{" "}
                    and all of their saved searches and leads to recovery for 3 days.
                    <span className="block mt-1 font-medium text-primary">
                      After 3 days, the deleted data will be permanently deleted and can no longer
                      be recovered.
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDeleteUser}
                  disabled={deleteUserLoading}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-5 space-y-2">
                <label htmlFor="delete-user-password" className="label-mono block">
                  Admin password
                </label>
                <input
                  id="delete-user-password"
                  type="password"
                  autoComplete="current-password"
                  value={deleteUserPassword}
                  onChange={(e) => {
                    setDeleteUserPassword(e.target.value);
                    setDeleteUserError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !deleteUserLoading) handleDeleteUser();
                  }}
                  placeholder="Enter your current admin password"
                  disabled={deleteUserLoading}
                  className="field field-focus h-10 w-full"
                  autoFocus
                />
                {deleteUserError && <p className="text-sm text-destructive">{deleteUserError}</p>}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={closeDeleteUser} disabled={deleteUserLoading}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteUser}
                  disabled={deleteUserLoading || !deleteUserPassword}
                >
                  {deleteUserLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {deleteUserLoading ? "Removing…" : "Remove user"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
