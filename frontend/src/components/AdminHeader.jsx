import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  UserPlus,
  Users,
  X,
  History,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, usePath } from "@/router/Router";
import { useAuth } from "@/context/AuthContext";

const baseItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Exports", href: "/admin/exports", icon: Download },
  { label: "Recent searches", href: "/admin/searches", icon: History },
];

export function AdminHeader({ title = "Admin Panel", subtitle = "WORKSPACE", backTo = "/admin", showBack = true }) {
  const { user, signOut } = useAuth();
  const path = usePath();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navHoverLocked, setNavHoverLocked] = useState(false);
  const firstPathRender = useRef(true);
  const isAdmin = !!user?.is_superuser;
  const roleLabel = isAdmin ? "Admin" : user?.role === "lead" ? "Lead" : "User";

  const items = [
    ...baseItems,
    ...(isAdmin ? [{ label: "Lead approvals", href: "/admin/lead-requests", icon: UserPlus }] : []),
    ...(isAdmin ? [{ label: "Audit logs", href: "/admin/audit-logs", icon: ScrollText }] : []),
    { label: "Search engine", href: "/search", icon: FileSearch },
    ...(isAdmin ? [{ label: "Recently deleted", href: "/admin/recovery", icon: ArchiveRestore }] : []),
  ];

  useEffect(() => {
    // The destination should render with the rail already closed. Do not animate
    // the page canvas while routing; that causes the content to visibly drift
    // toward the centre before the rail finishes closing.
    setCollapsed(true);
    setMobileOpen(false);
    if (firstPathRender.current) {
      firstPathRender.current = false;
      setNavHoverLocked(false);
    } else {
      // Keep the rail locked after a navigation click until the pointer actually
      // leaves the rail. This prevents mouseenter from reopening it mid-transition.
      setNavHoverLocked(true);
    }
  }, [path]);

  const isActive = (href) => {
    if (href === "/admin") return path === "/admin";
    return path === href || path.startsWith(`${href}/`);
  };

  function goBack() {
    if (window.history.length > 1 && document.referrer) {
      window.history.back();
    } else {
      navigate(backTo || "/admin");
    }
  }

  const navigation = (
    <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-5">
      {items.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          to={href}
          title={collapsed ? label : undefined}
          onClick={() => {
            // Lock hover expansion while the route changes. The pointer remains
            // over the clicked item, so without this lock mouseenter immediately
            // re-opens the rail and creates a visible expand/center/collapse flicker.
            setNavHoverLocked(true);
            setCollapsed(true);
            setMobileOpen(false);
          }}
          className={`group relative flex min-h-11 items-center rounded-2xl text-sm font-semibold transition-colors duration-150 ${
            collapsed ? "justify-center px-2" : "gap-3 px-3.5"
          } ${
            isActive(href)
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/15"
              : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          }`}
        >
          <Icon className="size-[19px] shrink-0 transition-transform duration-300 group-hover:scale-110" />
          <span
            className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
              collapsed
                ? "max-w-0 -translate-x-2 opacity-0"
                : "max-w-[180px] translate-x-0 opacity-100"
            }`}
          >
            {label}
          </span>
          {collapsed && (
            <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 hidden rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-xl group-hover:block">
              {label}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="admin-sidebar pointer-events-none fixed inset-y-0 left-0 z-50 hidden w-[260px] lg:flex">
        <div
          className={`pointer-events-auto absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-border bg-surface/95 shadow-xl backdrop-blur-xl transition-[width] duration-200 ease-out ${
            collapsed ? "w-[78px]" : "w-[260px]"
          }`}
          onMouseEnter={() => {
            if (!navHoverLocked) setCollapsed(false);
          }}
          onMouseLeave={() => {
            setNavHoverLocked(false);
            setCollapsed(true);
          }}
        >
          <div
            className={`flex h-[78px] shrink-0 items-center border-b border-border transition-all duration-200 ${collapsed ? "justify-center px-2" : "gap-3 px-5"}`}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Activity className="size-5" />
            </div>
            <div
              className={`min-w-0 overflow-hidden transition-[max-width,opacity] duration-150 ${collapsed ? "max-w-0 opacity-0" : "max-w-[190px] opacity-100"}`}
            >
              <p className="truncate text-sm font-bold tracking-tight">{user?.email || "Account"}</p>
              <p className="label-mono text-accent">{roleLabel}</p>
            </div>
          </div>
          {navigation}
          <div className="border-t border-border p-2">
            <div
              className={`mb-2 overflow-hidden rounded-2xl bg-surface-raised transition-[height,opacity,padding] duration-150 ${collapsed ? "h-0 mb-0 opacity-0 p-0" : "h-[58px] px-3 py-2.5 opacity-100"}`}
            >
              <p className="truncate text-xs font-semibold">{user?.email || "Account"}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {roleLabel}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                className={`rounded-xl ${collapsed ? "w-full justify-center" : "flex-1 justify-start gap-3"}`}
                onClick={() => signOut()}
                title="Sign out"
              >
                <LogOut className="size-4" />
                <span className={collapsed ? "sr-only" : ""}>Sign out</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={(event) => {
                  event.stopPropagation();
                  setNavHoverLocked(true);
                  setCollapsed((value) => !value);
                  window.setTimeout(() => setNavHoverLocked(false), 220);
                }}
                title={collapsed ? "Expand navigation" : "Collapse navigation"}
              >
                {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-border bg-surface shadow-2xl transition-transform duration-300 lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-[78px] items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </div>
            <div>
              <p className="truncate text-sm font-bold">{user?.email || "Account"}</p>
              <p className="label-mono text-accent">{roleLabel}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        {navigation}
      </aside>

      <header className="admin-topbar sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl lg:ml-[var(--admin-rail-width)]">
        <div className="flex min-h-[78px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-xl lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </Button>
            {showBack && (
              <Button variant="outline" className="shrink-0 gap-2 rounded-xl" onClick={goBack}>
                <ChevronLeft className="size-4" /> Back
              </Button>
            )}
            <div className="min-w-0">
              <p className="font-display truncate text-base font-bold sm:text-lg">{title}</p>
              <p className="label-mono text-accent truncate max-w-[260px]">
                {user?.email || subtitle}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold sm:inline-flex">
              {roleLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl lg:hidden"
              onClick={() => signOut()}
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}
