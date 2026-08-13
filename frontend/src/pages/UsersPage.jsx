import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
  UserPlus,
  UserRound,
  Users as UsersIcon,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AdminHeader } from "@/components/AdminHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, Navigate, useNavigate } from "@/router/Router";

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

function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export function UsersPage() {
  useDocumentTitle("Users");
  const { user, loading } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Create user modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    role: "user",
    fullName: "",
    email: "",
    password: "",
    sendEmail: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createdResult, setCreatedResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const canManage = !!user && (user.is_superuser || user.role === "lead");

  function loadUsers() {
    setState((prev) => ({ ...prev, loading: true }));
    adminApi
      .getUsers()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error: error.message }));
  }

  useEffect(() => {
    if (canManage) loadUsers();
  }, [canManage]);

  const users = useMemo(
    () =>
      (state.data?.users || []).filter((item) =>
        item.email.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [state.data, query],
  );

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateError(null);

    if (!form.email.trim()) {
      setCreateError("Email is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminApi.createUser({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role,
        sendEmail: form.sendEmail,
      });
      setCreatedResult(res);
      toast.success(`${form.role === "lead" ? "Lead" : "User"} account created successfully!`);
      loadUsers();
    } catch (err) {
      setCreateError(err.message || "Failed to create user account.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyCredentials() {
    if (!createdResult) return;
    const text = `LeadFinder Login Credentials\nRole: ${createdResult.user?.role?.toUpperCase()}\nEmail: ${createdResult.user?.email}\nPassword: ${createdResult.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Credentials copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  }

  function resetCreateModal() {
    setForm({ role: "user", fullName: "", email: "", password: "", sendEmail: true });
    setCreatedResult(null);
    setCreateError(null);
    setShowPassword(false);
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
      <AdminHeader title="Users" subtitle="IDENTITY · USERS" showBack={false} />
      <div className="admin-content">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="label-mono text-accent">IDENTITY DIRECTORY</p>
                <h1 className="mt-2 font-display text-3xl font-bold">Users & Leads</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Manage accounts and provision credentials for Users and Leads. Select any row to view activity history.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px]">
                  <UsersIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by email"
                    className="field field-focus h-11 pl-9 text-sm"
                  />
                </div>
                <Button
                  onClick={() => {
                    resetCreateModal();
                    setCreateOpen(true);
                  }}
                  className="gap-2 rounded-xl"
                >
                  <UserPlus className="size-4" /> Create Account
                </Button>
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
                <h2 className="font-bold">Workspace users</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {users.length} visible · users and leads
                </p>
              </div>
              <span className="label-mono">Click any row</span>
            </div>
            {state.loading ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No matching users.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/60">
                      {["Email", "Role", "Joined", "Searches", "Leads saved", "Last active"].map(
                        (h) => (
                          <th key={h} className="label-mono px-5 py-3 text-left">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => navigate(`/admin/users/${item.id}`)}
                        className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-primary/[0.035]"
                      >
                        <td className="px-5 py-4">
                          <Link
                            to={`/admin/users/${item.id}`}
                            className="inline-flex items-center gap-2 font-semibold hover:text-primary"
                          >
                            {item.email}
                            <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant={
                              item.isSuperuser
                                ? "default"
                                : item.role === "lead"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {item.isSuperuser ? "Admin" : item.role === "lead" ? "Lead" : "User"}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatTimestamp(item.createdAt)}
                        </td>
                        <td className="px-5 py-4 font-mono">{item.searchCount}</td>
                        <td className="px-5 py-4 font-mono">{item.leadCount}</td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatTimestamp(item.lastSearchAt) || "Never searched"}
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

      {/* Create Account Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl sm:p-8">
            {!createdResult ? (
              <>
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <UserPlus className="size-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-xl font-bold">Create Account</h2>
                      <p className="text-xs text-muted-foreground">
                        Provision user/lead credentials and dispatch login details
                      </p>
                    </div>
                  </div>
                </div>

                {createError && (
                  <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                    {createError}
                  </div>
                )}

                <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
                  <div>
                    <label className="label-mono mb-2 block">Account Type / Role</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: "user" }))}
                        className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${
                          form.role === "user"
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border text-muted-foreground hover:bg-surface-raised"
                        }`}
                      >
                        <UserRound className="size-4" />
                        User
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: "lead" }))}
                        className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${
                          form.role === "lead"
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border text-muted-foreground hover:bg-surface-raised"
                        }`}
                      >
                        <UsersRound className="size-4" />
                        Lead
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label-mono mb-1.5 block" htmlFor="create-full-name">
                      Full Name
                    </label>
                    <input
                      id="create-full-name"
                      type="text"
                      value={form.fullName}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                      placeholder="e.g. Jane Doe"
                      className="field field-focus w-full text-sm"
                    />
                  </div>

                  <div>
                    <label className="label-mono mb-1.5 block" htmlFor="create-email">
                      Email Address *
                    </label>
                    <input
                      id="create-email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="field field-focus w-full text-sm"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="label-mono block" htmlFor="create-password">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, password: generatePassword() }))
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <Sparkles className="size-3" /> Auto-generate
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="create-password"
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Leave blank to auto-generate"
                        className="field field-focus w-full pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={form.sendEmail}
                      onChange={(e) => setForm((f) => ({ ...f, sendEmail: e.target.checked }))}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Send login credentials via email
                  </label>

                  <div className="mt-6 flex items-center justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => setCreateOpen(false)}
                      className="rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting} className="gap-2 rounded-xl">
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                      Create & Issue Credentials
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                    <Check className="size-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold">Account Created!</h2>
                    <p className="text-xs text-muted-foreground">
                      The {createdResult.user?.role} account has been provisioned successfully.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface-raised p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Role:</span>
                    <Badge variant={createdResult.user?.role === "lead" ? "secondary" : "outline"}>
                      {createdResult.user?.role?.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-mono font-semibold">{createdResult.user?.email}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Password:</span>
                    <span className="font-mono font-bold text-primary">{createdResult.password}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-xs pt-1 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Email Status:</span>
                      <span className={`font-semibold ${createdResult.emailSent ? "text-emerald-600" : "text-amber-600"}`}>
                        {createdResult.emailSent ? "Sent to recipient / log" : "Manual dispatch required"}
                      </span>
                    </div>
                    {createdResult.emailError && (
                      <p className="mt-1 text-[11px] text-amber-600 bg-amber-500/10 rounded p-1.5 leading-snug">
                        <strong>Mail Delivery Info:</strong> {createdResult.emailError}
                      </p>
                    )}
                  </div>
                </div>


                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleCopyCredentials}
                    variant="outline"
                    className="w-full gap-2 rounded-xl"
                  >
                    {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                    {copied ? "Copied!" : "Copy Credentials"}
                  </Button>
                  <Button
                    onClick={() => {
                      resetCreateModal();
                    }}
                    className="w-full rounded-xl"
                  >
                    Create Another
                  </Button>
                </div>
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

