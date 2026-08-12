import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Browser-side deterrent only. It applies to normal users, never admins.
// It cannot reliably prevent OS-level screenshots, screen recording, or a
// determined user from inspecting a web application. Keep real protection
// on the server/API as well.
export function UserProtection({ children }) {
  const { user, loading } = useAuth();
  const enabled = !loading && !!user && !user.is_superuser;
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    const blockContextMenu = (event) => event.preventDefault();
    const blockCopy = (event) => event.preventDefault();
    const blockDrag = (event) => event.preventDefault();
    const blockShortcuts = (event) => {
      const key = String(event.key || "").toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      // DevTools, view-source, print and save-page shortcuts.
      if (
        key === "f12" ||
        (mod && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        (mod && ["u", "p", "s"].includes(key))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("contextmenu", blockContextMenu, true);
    document.addEventListener("copy", blockCopy, true);
    document.addEventListener("cut", blockCopy, true);
    document.addEventListener("dragstart", blockDrag, true);
    window.addEventListener("keydown", blockShortcuts, true);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu, true);
      document.removeEventListener("copy", blockCopy, true);
      document.removeEventListener("cut", blockCopy, true);
      document.removeEventListener("dragstart", blockDrag, true);
      window.removeEventListener("keydown", blockShortcuts, true);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setDevToolsOpen(false);
      return undefined;
    }

    const threshold = 160;
    const check = () => {
      const widthGap = window.outerWidth - window.innerWidth > threshold;
      const heightGap = window.outerHeight - window.innerHeight > threshold;
      setDevToolsOpen(widthGap || heightGap);
    };

    check();
    const timer = window.setInterval(check, 1500);
    window.addEventListener("resize", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", check);
    };
  }, [enabled]);

  return (
    <div className={enabled ? "user-protected-app" : undefined}>
      {enabled && devToolsOpen && (
        <div className="user-protection-warning" role="status">
          <ShieldAlert className="size-4 shrink-0" />
          <span>Developer tools detected. Please close them to continue.</span>
        </div>
      )}
      {children}
    </div>
  );
}
