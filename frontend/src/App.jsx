import { AuthProvider, useAuth } from "@/context/AuthContext";
import { RouterProvider, Route, usePath } from "@/router/Router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { LeadFinderPage } from "@/pages/LeadFinderPage";
import { LoginPage } from "@/pages/LoginPage";
import { AdminPage } from "@/pages/AdminPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { UserProtection } from "@/components/UserProtection";

const ROUTES = ["/", "/login", "/admin", "/search"];

function Pages() {
  const path = usePath();
  const { user, loading } = useAuth();
  // Superusers land on the admin panel by default - it's "home" for
  // them. The search engine (LeadFinderPage) is still one click away
  // (see the "Search engine" button in AdminPage's header, and the
  // dedicated /search route below), and /admin keeps working directly
  // for anyone who bookmarks or links straight to it. Everyone else's
  // home is unchanged: the search engine.
  const adminIsHome = !loading && !!user && user.is_superuser;

  return (
    <>
      <Route path="/">{adminIsHome ? <AdminPage /> : <LeadFinderPage />}</Route>
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/admin">
        <AdminPage />
      </Route>
      <Route path="/search">
        <LeadFinderPage />
      </Route>
      {!ROUTES.includes(path) && <NotFoundPage />}
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
