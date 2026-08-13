import { useEffect, useState } from "react";
import { ArchiveRestore, Clock3, Loader2, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigate } from "@/router/Router";

function formatTimestamp(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });
}
function remaining(value) {
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const hours = Math.ceil(ms / 3600000);
  return hours >= 24 ? `${Math.ceil(hours / 24)} days left` : `${hours} hours left`;
}

export function RecoveryPage() {
  useDocumentTitle("Recently deleted");
  const { user, loading } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [target, setTarget] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canManage = !!user?.is_superuser;

  async function load() {
    setState({ loading: true, data: null, error: null });
    try {
      setState({ loading: false, data: await adminApi.getRecoveryItems(), error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: e.message });
    }
  }
  useEffect(() => {
    if (canManage) load();
  }, [canManage]);

  async function restore() {
    if (!password) {
      setError("Enter your password to restore this item.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.restoreRecovery(target.id, password);
      setTarget(null);
      setPassword("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
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

  const items = state.data?.items || [];
  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="Recently deleted" subtitle="RECOVERY · DATA REVIVAL" />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <ArchiveRestore className="size-6" />
              </div>
              <div>
                <p className="label-mono text-accent">RECOVERY CENTER</p>
                <h1 className="mt-2 font-display text-3xl font-bold">Recently deleted</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  A structured recovery queue for deleted users and saved data. Items are retained
                  for three days and can be restored with password confirmation.
                </p>
              </div>
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-bold">Recovery queue</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {items.length} recoverable item{items.length === 1 ? "" : "s"}
                </p>
              </div>
              <Badge variant="outline">3-day retention</Badge>
            </div>
            {state.loading ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Loading recovery queue…
              </p>
            ) : state.error ? (
              <p className="px-6 py-10 text-center text-sm text-destructive">{state.error}</p>
            ) : items.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Trash2 className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-semibold">Nothing is waiting for recovery</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Deleted users and data will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["Type", "Target", "Deleted", "Records", "Recovery window", "Operation"].map(
                        (h) => (
                          <th key={h} className="label-mono px-5 py-3 text-left">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border/60 last:border-0 hover:bg-primary/[0.025]"
                      >
                        <td className="px-5 py-4">
                          <Badge variant={item.kind === "user" ? "secondary" : "outline"}>
                            {item.kind === "user"
                              ? "User"
                              : item.kind === "all_data"
                                ? "Workspace data"
                                : "User data"}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 font-medium">{item.userEmail || item.label}</td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatTimestamp(item.deletedAt)}
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {item.searchCount} searches · {item.leadCount} leads
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                            <Clock3 className="size-3.5" />
                            {remaining(item.expiresAt)}
                          </span>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            until {formatTimestamp(item.expiresAt)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <Button
                            size="sm"
                            className="gap-2 rounded-lg"
                            onClick={() => {
                              setTarget(item);
                              setPassword("");
                              setError(null);
                            }}
                          >
                            <RotateCcw className="size-3.5" />
                            Restore
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {target && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 p-5 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <RotateCcw className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-bold">Restore data</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {target.userEmail || target.label}
                    </p>
                  </div>
                </div>
                {error && (
                  <p className="mt-4 rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <label className="mt-5 block text-xs font-semibold text-muted-foreground">
                  Current password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field field-focus mt-1.5"
                    autoFocus
                  />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button onClick={restore} disabled={busy || !password}>
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Restore
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
