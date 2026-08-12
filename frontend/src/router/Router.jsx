// Small, dependency-free client-side router.
//
// This app only ever had two real screens ("/" and "/login"), so rather
// than pull in react-router (or keep TanStack Router) this implements the
// handful of primitives an SPA like this actually needs: a context that
// tracks the current pathname, a <Link> that pushes to it instead of doing
// a full navigation, and a useNavigate() hook for programmatic redirects.

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const RouterContext = createContext(null);

export function RouterProvider({ children }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    function onPopState() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useMemo(
    () =>
      (to, { replace = false } = {}) => {
        if (to === window.location.pathname) return;
        if (replace) {
          window.history.replaceState({}, "", to);
        } else {
          window.history.pushState({}, "", to);
        }
        setPath(to);
      },
    [],
  );

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouterContext() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("Router primitives must be used within <RouterProvider>");
  return ctx;
}

export function usePath() {
  return useRouterContext().path;
}

export function useNavigate() {
  return useRouterContext().navigate;
}

/** Renders `children` only when the current path matches `path` exactly. */
export function Route({ path, children }) {
  const current = usePath();
  return current === path ? children : null;
}

/** In-app link: same look as <a>, but navigates via history.pushState. */
export function Link({ to, children, className, ...rest }) {
  const navigate = useNavigate();

  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }

  return (
    <a href={to} onClick={onClick} className={className} {...rest}>
      {children}
    </a>
  );
}

/** Programmatic redirect, e.g. `return <Navigate to="/login" />;`. */
export function Navigate({ to, replace = true }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return null;
}
