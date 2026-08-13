import { useEffect, useState } from "react";
import { Activity, Loader2, ShieldAlert } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, Navigate, usePath } from "@/router/Router";

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
  const match = path.match(/^\/admin\/users\/([^/]+)\/logs$/);
  return match?.[1] || null;
}

function prettyAction(action) {
  return String(action || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminLogsPage() {
  useDocumentTitle("User activity logs");
  const path = usePath();
  const { user, loading } = useAuth();
  const userId = getUserId(path);
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const isAdmin = !!user && user.is_superuser;

  useEffect(() => {
    if (!userId || !isAdmin) return;
    setState({ loading: true, data: null, error: null });
    adminApi
      .getUserLogs(userId)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  }, [userId, isAdmin]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto size-9 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-bold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Lead accounts can manage users but cannot view audit logs.
          </p>
          <Button asChild className="mt-5">
            <Link to="/admin">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader
        title="User Activity Logs"
        subtitle="AUDIT LOGS"
        backTo={`/admin/users/${userId}`}
      />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8 lg:py-10">
          <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Activity className="size-6" />
                </div>
                <div>
                  <p className="label-mono text-accent">AUDIT HISTORY</p>
                  <h1 className="mt-1 font-display text-2xl font-bold">
                    {state.data?.user?.fullName || state.data?.user?.email || "User logs"}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {state.data?.user?.email || "Loading…"}
                  </p>
                </div>
                {state.data?.user?.role && (
                  <Badge variant="outline">
                    {state.data.user.role === "admin"
                      ? "Admin"
                      : state.data.user.role === "lead"
                        ? "Lead"
                        : "User"}
                  </Badge>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Activity log</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every saved search, export, login and management operation is recorded.
                </p>
              </div>
              <span className="label-mono">{state.data?.logs?.length ?? 0} events</span>
            </div>

            {state.loading ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Loading activity…
              </p>
            ) : state.error ? (
              <p className="px-5 py-10 text-center text-sm text-destructive">{state.error}</p>
            ) : !state.data?.logs?.length ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No activity has been recorded for this user yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["Time", "Action", "Performed by", "Details"].map((heading) => (
                        <th key={heading} className="label-mono px-4 py-3 text-left font-semibold">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.logs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-border/60 align-top last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatTimestamp(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium">{prettyAction(log.action)}</td>
                        <td className="px-4 py-3 text-xs">
                          {log.actorEmail || user?.email || "—"}
                        </td>
                        <td className="max-w-xl px-4 py-3">
                          <pre className="whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">
                            {JSON.stringify(log.details || {}, null, 2)}
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
