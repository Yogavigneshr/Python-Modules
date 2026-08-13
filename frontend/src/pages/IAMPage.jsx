import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Loader2, ShieldCheck, UserCog, Users } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Navigate } from "@/router/Router";

const permissions = {
  admin: [
    "Manage users",
    "Export all data",
    "Clear user/workspace data",
    "Restore deleted data",
    "Manage IAM roles",
    "View all audit logs",
  ],
  lead: [
    "Open user panels",
    "Export data",
    "Clear user data",
    "Restore deleted data",
    "No audit-log access",
    "No IAM role changes",
  ],
  user: [
    "Use the search engine",
    "Save searches",
    "Manage personal data",
    "No cross-user access",
    "No audit-log access",
    "No IAM access",
  ],
};

export function IAMPage() {
  useDocumentTitle("IAM");
  const { user, loading } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [changing, setChanging] = useState(null);
  const isAdmin = !!user?.is_superuser;

  async function load() {
    setState({ loading: true, data: null, error: null });
    try {
      const data = await adminApi.getUsers();
      setState({ loading: false, data, error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: e.message });
    }
  }
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  async function changeRole(id, role) {
    setChanging(id);
    try {
      await adminApi.setUserRole(id, role);
      await load();
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    } finally {
      setChanging(null);
    }
  }

  const users = useMemo(() => state.data?.users || [], [state.data]);
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  if (!isAdmin) return <Navigate to="/admin" />;

  return (
    <main className="min-h-screen bg-background">
      <AdminHeader title="IAM" subtitle="SECURITY · ACCESS MANAGEMENT" />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <p className="label-mono text-accent">IDENTITY & ACCESS MANAGEMENT</p>
                <h1 className="mt-2 font-display text-3xl font-bold">IAM</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Control workspace roles and keep permissions explicit. IAM is separated from the
                  Users directory so identity administration remains structured and auditable.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-7 grid gap-4 md:grid-cols-3">
            {[
              ["admin", "Admin", ShieldCheck],
              ["lead", "Lead", UserCog],
              ["user", "User", Users],
            ].map(([key, label, Icon]) => (
              <div key={key} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <Badge
                    variant={key === "admin" ? "default" : key === "lead" ? "secondary" : "outline"}
                  >
                    {label}
                  </Badge>
                </div>
                <ul className="mt-5 space-y-2.5">
                  {permissions[key].map((item) => (
                    <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-5 py-5 sm:px-6">
              <div className="flex items-center gap-3">
                <KeyRound className="size-5 text-primary" />
                <div>
                  <h2 className="font-bold">Role assignments</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Only Admin can change access levels. Changes are written to the audit trail.
                  </p>
                </div>
              </div>
            </div>
            {state.error && (
              <p className="border-b border-destructive/20 bg-destructive/5 px-6 py-3 text-sm text-destructive">
                {state.error}
              </p>
            )}
            {state.loading ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Loading identity directory…
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["Identity", "Current role", "Access level", "Change"].map((h) => (
                        <th key={h} className="label-mono px-5 py-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => {
                      const role = item.isSuperuser ? "admin" : item.role || "user";
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-border/60 last:border-0 hover:bg-primary/[0.025]"
                        >
                          <td className="px-5 py-4">
                            <p className="font-semibold">{item.email}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.fullName || "Workspace identity"}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <Badge
                              variant={
                                role === "admin"
                                  ? "default"
                                  : role === "lead"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {role === "admin" ? "Admin" : role === "lead" ? "Lead" : "User"}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-xs text-muted-foreground">
                            {permissions[role]?.slice(0, 3).join(" · ")}
                          </td>
                          <td className="px-5 py-4">
                            {item.isSuperuser ? (
                              <span className="text-xs font-semibold text-muted-foreground">
                                Protected admin
                              </span>
                            ) : (
                              <select
                                value={role}
                                onChange={(e) => changeRole(item.id, e.target.value)}
                                disabled={changing === item.id}
                                className="field field-focus h-9 max-w-[150px] text-xs"
                              >
                                <option value="user">User</option>
                                <option value="lead">Lead</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
