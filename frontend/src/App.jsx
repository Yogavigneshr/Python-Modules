import { AuthProvider, useAuth } from "@/context/AuthContext";
import { RouterProvider, Route, usePath } from "@/router/Router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { LeadFinderPage } from "@/pages/LeadFinderPage";
import { LoginPage } from "@/pages/LoginPage";
import { AdminPage } from "@/pages/AdminPage";
import { UsersPage } from "@/pages/UsersPage";
import { UserPanelPage } from "@/pages/UserPanelPage";
import { AdminLogsPage } from "@/pages/AdminLogsPage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";
import { RecoveryPage } from "@/pages/RecoveryPage";
import { RecentSearchesPage } from "@/pages/RecentSearchesPage";
import { ExportsPage } from "@/pages/ExportsPage";
import { LeadRequestsPage } from "@/pages/LeadRequestsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { UserProtection } from "@/components/UserProtection";

const STATIC_ROUTES = [
  "/",
  "/login",
  "/login/user",
  "/login/lead",
  "/login/admin",
  "/admin",
  "/admin/users",
  "/admin/searches",
  "/admin/exports",
  "/admin/lead-requests",
  "/admin/audit-logs",
  "/admin/recovery",
  "/search",
];

function Pages() {
  const path = usePath();
  const pathname = path.split("?")[0];
  const { user, loading } = useAuth();
  const adminIsHome = !loading && !!user && (user.is_superuser || user.role === "lead");

  return (
    <>
      <Route path="/">{adminIsHome ? <AdminPage /> : <LeadFinderPage />}</Route>
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/login/user">
        <LoginPage />
      </Route>
      <Route path="/login/lead">
        <LoginPage />
      </Route>
      <Route path="/login/admin">
        <LoginPage />
      </Route>
      <Route path="/admin">
        <AdminPage />
      </Route>
      <Route path="/admin/users">
        <UsersPage />
      </Route>
      <Route path="/admin/searches">
        <RecentSearchesPage />
      </Route>
      <Route path="/admin/exports">
        <ExportsPage />
      </Route>
      <Route path="/admin/lead-requests">
        <LeadRequestsPage />
      </Route>
      <Route path="/admin/audit-logs">
        <AuditLogsPage />
      </Route>
      <Route path="/admin/recovery">
        <RecoveryPage />
      </Route>
      {path.startsWith("/admin/users/") && path.endsWith("/logs") ? (
        <AdminLogsPage />
      ) : path.startsWith("/admin/users/") ? (
        <UserPanelPage />
      ) : null}
      <Route path="/search">
        <LeadFinderPage />
      </Route>
      {!STATIC_ROUTES.includes(pathname) && !pathname.startsWith("/admin/users/") && <NotFoundPage />}
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider>
        <AuthProvider>
          <UserProtection>
            <Pages />
          </UserProtection>
          <Toaster />
        </AuthProvider>
      </RouterProvider>
    </ErrorBoundary>
  );
}
