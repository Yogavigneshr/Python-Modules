// Replaces src/lib/supabase.client.js.
// Talks to the Django backend instead of Supabase directly.
// Access/refresh tokens are kept in localStorage (browser-only, same
// constraint the old Supabase browser client had).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const ACCESS_KEY = "lf_access_token";
const REFRESH_KEY = "lf_refresh_token";

export function getTokens() {
  if (typeof window === "undefined") return { access: null, refresh: null };
  return {
    access: window.localStorage.getItem(ACCESS_KEY),
    refresh: window.localStorage.getItem(REFRESH_KEY),
  };
}

export function setTokens({ access, refresh }) {
  if (typeof window === "undefined") return;
  if (access) window.localStorage.setItem(ACCESS_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

async function refreshAccessToken() {
  const { refresh } = getTokens();
  if (!refresh) return null;

  const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data = await res.json();
  setTokens({ access: data.access });
  return data.access;
}

/** Authenticated fetch wrapper: attaches the JWT, retries once on 401. */
export async function apiFetch(path, options = {}) {
  const { access } = getTokens();
  const doFetch = (token) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

  let res = await doFetch(access);
  if (res.status === 401) {
    const newAccess = await refreshAccessToken();
    if (newAccess) res = await doFetch(newAccess);
  }
  return res;
}

export const authApi = {
  async login(email, password) {
    const res = await fetch(`${API_BASE_URL}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json())?.detail || "Sign in failed");
    const data = await res.json();
    setTokens({ access: data.access, refresh: data.refresh });
    return data.user;
  },

  async register(fullName, email, password) {
    const res = await fetch(`${API_BASE_URL}/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = Object.values(err).flat().join(" ") || "Sign up failed";
      throw new Error(message);
    }
    // Registration never logs the user in. They must authenticate again.
    return (await res.json()).user;
  },

  async me() {
    const { access } = getTokens();
    if (!access) return null;
    const res = await apiFetch("/auth/me/");
    if (!res.ok) return null;
    return res.json();
  },

  async logout() {
    const { refresh } = getTokens();
    try {
      await apiFetch("/auth/logout/", {
        method: "POST",
        body: JSON.stringify({ refresh }),
      });
    } finally {
      clearTokens();
    }
  },
};

export const leadsApi = {
  async searchLeads(payload) {
    const res = await apiFetch("/search-leads/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Search failed");
    }
    return res.json();
  },

  /** POST /api/searches/save/ - persists the given search + leads to the
   *  database. Nothing is saved before this is called. */
  async saveSearch(payload) {
    const res = await apiFetch("/searches/save/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save results");
    }
    return res.json();
  },

  /** GET /api/searches/<id>/leads/ -> the full saved lead list for one
   *  past search, read straight from the database. */
  async getSearchLeads(id) {
    const res = await apiFetch(`/searches/${id}/leads/`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to load saved results");
    }
    return res.json();
  },
};

/** Downloads a Blob response from an authenticated fetch - shared by every
 * admin export button (browsers can't attach an Authorization header to a
 * plain <a href> download, so the file has to be fetched then saved). */
function downloadResponse(res, fallbackName) {
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || fallbackName;
  return res.blob().then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
}

/** Admin panel API - staff/superuser only (see leads/admin_api.py). */
export const adminApi = {
  /** GET /api/admin/overview/ -> headline stats + recent searches. */
  async getOverview() {
    const res = await apiFetch("/admin/overview/");
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load overview");
    return res.json();
  },

  /** GET /api/admin/users/ -> every user + their search/lead counts. */
  async getUsers() {
    const res = await apiFetch("/admin/users/");
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load users");
    return res.json();
  },

  /** DELETE /api/admin/users/<id>/ -> permanently removes one user.
   * Requires the current admin's password for confirmation.
   */
  async deleteUser(userId, password) {
    const res = await apiFetch(`/admin/users/${userId}/`, {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "Failed to remove user");
    }
    return res.json();
  },

  async getRecoveryItems() {
    const res = await apiFetch("/admin/recovery/");
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load recently deleted data");
    return res.json();
  },

  async restoreRecovery(id, password) {
    const res = await apiFetch(`/admin/recovery/${id}/restore/`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to recover data");
    return res.json();
  },

  /** GET /api/admin/users/<id>/searches/ -> one user's full search history. */
  async getUserSearches(userId) {
    const res = await apiFetch(`/admin/users/${userId}/searches/`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load user history");
    return res.json();
  },

  /** GET /api/searches/<id>/leads/ -> a specific search's saved leads
   *  (admins can load any user's search here, not just their own). */
  async getSearchLeads(id) {
    return leadsApi.getSearchLeads(id);
  },

  /** Retrieves filtered lead data for the admin preview without downloading a file. */
  async previewExport({ userId, dateFrom, dateTo } = {}) {
    const params = new URLSearchParams({ scope: "leads", preview: "1" });
    if (userId) params.set("user", userId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const res = await apiFetch(`/admin/export/?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "Failed to retrieve export data");
    }
    return res.json();
  },

  /** Downloads an export of search/lead history.
   * `userId` omitted -> exports every user's history.
   * `scope` is "leads" (one row per lead, default) or "searches".
   * `format` is "csv" (default) or "json".
   * `columns` is an optional array of column keys, in the order they
   * should appear - omit to include every column for the scope.
   * `dateFrom`/`dateTo` (optional, "YYYY-MM-DD") scope the export to a
   * date range for timely/period-specific exports - omit either or both
   * for an unbounded range. */
  async exportHistory({
    userId,
    searchId,
    scope = "leads",
    format = "csv",
    columns,
    dateFrom,
    dateTo,
  } = {}) {
    // Keep the original, known-good CSV request for the common export path.
    // The enhanced filters are only sent when the caller actually uses them.
    // This prevents a stale/mismatched backend from breaking the basic
    // "Export" buttons while still supporting the newer export controls.
    const hasEnhancedOptions =
      Boolean(searchId) ||
      format !== "csv" ||
      (columns && columns.length) ||
      dateFrom ||
      dateTo;

    const params = new URLSearchParams({ scope });
    if (userId) params.set("user", userId);
    if (searchId) params.set("searchId", searchId);

    if (hasEnhancedOptions) {
      params.set("format", format);
      if (columns && columns.length) params.set("columns", columns.join(","));
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }

    let res = await apiFetch(`/admin/export/?${params.toString()}`);

    // If an enhanced export fails, retry once using the legacy CSV contract.
    // This makes the download resilient to an older backend deployment.
    if (!res.ok && hasEnhancedOptions && !searchId) {
      const fallbackParams = new URLSearchParams({ scope });
      if (userId) fallbackParams.set("user", userId);
      res = await apiFetch(`/admin/export/?${fallbackParams.toString()}`);
      if (res.ok) {
        return downloadResponse(res, `leadfinder_admin_export_${scope}.csv`);
      }
    }

    if (!res.ok) {
      let message = "Export failed";
      try {
        const data = await res.json();
        message = data?.error || data?.detail || message;
      } catch {
        // The server may have returned HTML/plain text for a 5xx response.
      }
      throw new Error(message);
    }

    const extension = format === "json" ? "json" : "csv";
    return downloadResponse(res, `leadfinder_admin_export_${scope}.${extension}`);
  },

  /** DELETE /api/admin/clear/ - wipes saved search/lead data. Pass
   * `userId` to clear one user's data only; omit to clear everyone's.
   * Irreversible - the backend requires confirm: true. */
  async clearAllData({ userId, password } = {}) {
    const res = await apiFetch("/admin/clear/", {
      method: "DELETE",
      body: JSON.stringify({
        confirm: true,
        password,
        ...(userId ? { userId } : {}),
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to clear data");
    return res.json();
  },
};
