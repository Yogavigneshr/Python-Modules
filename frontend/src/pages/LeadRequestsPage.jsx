import { useEffect, useState } from "react";
import { Check, Clock3, Loader2, UserPlus, X } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
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

export function LeadRequestsPage() {
  useDocumentTitle("Lead approvals");
  const { user, loading } = useAuth();
  const [state, setState] = useState({ loading: true, requests: [], error: null });
  const [busy, setBusy] = useState(null);
  const isAdmin = !!user?.is_superuser;

  function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    adminApi
      .getLeadRequests()
      .then((data) => setState({ loading: false, requests: data.requests || [], error: null }))
      .catch((error) => setState({ loading: false, requests: [], error: error.message }));
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  async function review(id, decision) {
    setBusy(`${decision}-${id}`);
    try {
      await adminApi.reviewLeadRequest(id, decision);
      load();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setBusy(null);
    }
  }

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login/admin" />;
  if (!isAdmin) return <Navigate to="/admin" />;

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="Lead approvals" subtitle="ACCESS REQUESTS" />
      <div className="admin-content">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UserPlus className="size-6" />
              </div>
              <div>
                <p className="label-mono text-accent">ADMIN VERIFICATION</p>
                <h1 className="mt-1 font-display text-3xl font-bold">Lead access requests</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  A Lead can sign up, but cannot sign in until you approve the request.
                </p>
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
                <h2 className="font-bold">Pending requests</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {state.requests.length} waiting for verification
                </p>
              </div>
              <Clock3 className="size-5 text-muted-foreground" />
            </div>
            {state.loading ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Loading requests…
              </p>
            ) : state.requests.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No pending Lead requests.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["Name", "Email", "Requested", "Decision"].map((h) => (
                        <th key={h} className="label-mono px-5 py-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.requests.map((item) => (
                      <tr key={item.id} className="border-b border-border/60 last:border-0">
                        <td className="px-5 py-4 font-semibold">{item.fullName}</td>
                        <td className="px-5 py-4">{item.email}</td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatTimestamp(item.createdAt)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="gap-2 rounded-lg"
                              disabled={!!busy}
                              onClick={() => review(item.id, "approve")}
                            >
                              <Check className="size-3.5" />
                              {busy === `approve-${item.id}` ? "Approving…" : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2 rounded-lg"
                              disabled={!!busy}
                              onClick={() => review(item.id, "reject")}
                            >
                              <X className="size-3.5" />
                              {busy === `reject-${item.id}` ? "Rejecting…" : "Reject"}
                            </Button>
                          </div>
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
