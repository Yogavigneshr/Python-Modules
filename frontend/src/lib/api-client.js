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
  async login(role, email, password) {
    const normalizedRole = role === "admin" || role === "lead" ? role : "user";
    const res = await fetch(`${API_BASE_URL}/auth/login/${normalizedRole}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.detail || "Sign in failed");
    setTokens({ access: body.access, refresh: body.refresh });
    return body.user;
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

  async registerLead(fullName, email, password) {
    const res = await fetch(`${API_BASE_URL}/auth/register/lead/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = Object.values(body).flat().join(" ") || body?.detail || "Lead signup failed";
      throw new Error(message);
    }
    return body;
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

function downloadCsvRows(filename, headers, rows) {
  const esc = (value) => {
    const text = value == null ? "" : String(value);
    return /[\",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFilenameTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function clientExportHistory({ userId, scope = "leads" } = {}) {
  const source = userId
    ? await adminApi.getUserSearches(userId)
    : await adminApi.getRecentSearches();
  const searches = source.searches || [];
  if (scope === "searches") {
    downloadCsvRows(
      `${(source.user?.email || "all")
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")}_searches_${exportFilenameTimestamp()}.csv`,
      ["User Email", "Search Category", "Search Location", "Leads Saved", "Searched At"],
      searches.map((s) => [
        s.userEmail || source.user?.email || "",
        s.category || "",
        s.location || "",
        s.leadCount ?? 0,
        s.createdAt || "",
      ]),
    );
    return;
  }

  const chunks = await Promise.all(
    searches.map(async (search) => {
      try {
        return await adminApi.getSearchLeads(search.id);
      } catch {
        return null;
      }
    }),
  );
  const headers = [
    "User Email",
    "Search Category",
    "Search Location",
    "Business Name",
    "Address",
    "Phone",
    "Website",
    "Rating",
    "Reviews",
    "Rank",
    "Searched At",
  ];
  const rows = [];
  chunks.forEach((data, index) => {
    if (!data) return;
    const search = searches[index];
    (data.leads || []).forEach((lead) =>
      rows.push([
        data.createdByEmail || search.userEmail || "",
        data.category || search.category || "",
        data.location || search.location || "",
        lead.name || "",
        lead.address || "",
        lead.phone || "",
        lead.website || "",
        lead.rating ?? "",
        lead.reviews ?? "",
        lead.rank ?? "",
        data.createdAt || search.createdAt || "",
      ]),
    );
  });
  const username = String(source.user?.email || "all")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  downloadCsvRows(`${username}_leads.csv`, headers, rows);
}

function getCurrentAdminEmail() {
  try {
    const raw = window.localStorage.getItem("lf_user");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.email || "";
    }
  } catch {
    // Ignore malformed local auth metadata.
  }
  return "";
}

/** Admin panel API - staff/superuser only (see leads/admin_api.py). */
export const adminApi = {
  /** GET /api/admin/overview/ -> headline stats + recent searches. */
  async getOverview() {
    const res = await apiFetch("/admin/overview/");
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load overview");
    return res.json();
  },

  /** GET /api/admin/users/ -> every user + their search/lead counts. */
  async getUsers() {
    const res = await apiFetch("/admin/users/");
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load users");
    return res.json();
  },

  /** POST /api/admin/users/create/ -> provisions a User or Lead account and dispatches credentials. */
  async createUser({ fullName, email, password, role = "user", sendEmail = true }) {
    const res = await apiFetch("/admin/users/create/", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password, role, sendEmail }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "Failed to create account");
    return body;
  },


  async getRecentSearches() {
    const res = await apiFetch("/admin/searches/");
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({})))?.error || "Failed to load recent searches",
      );
    return res.json();
  },

  async getLeadRequests() {
    const res = await apiFetch("/admin/lead-requests/");
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({})))?.error || "Failed to load lead requests",
      );
    return res.json();
  },

  async reviewLeadRequest(requestId, decision) {
    const res = await apiFetch(`/admin/lead-requests/${requestId}/`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({})))?.error || "Failed to review lead request",
      );
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
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({})))?.error || "Failed to load recently deleted data",
      );
    return res.json();
  },

  async restoreRecovery(id, password) {
    const res = await apiFetch(`/admin/recovery/${id}/restore/`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({})))?.error || "Failed to recover data");
    return res.json();
  },

  /** GET /api/admin/users/<id>/searches/ -> one user's full search history. */
  async getUserSearches(userId) {
    const res = await apiFetch(`/admin/users/${userId}/searches/`);
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load user history");
    return res.json();
  },

  /** GET /api/admin/logs/ -> workspace-wide audit logs. Superuser only. */
  async getAuditLogs() {
    const res = await apiFetch("/admin/logs/");
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load audit logs");
    return res.json();
  },

  /** GET /api/admin/users/<id>/logs/ -> audit logs. Superuser only. */
  async getUserLogs(userId) {
    const res = await apiFetch(`/admin/users/${userId}/logs/`);
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load user logs");
    return res.json();
  },

  /** GET /api/searches/<id>/leads/ -> a specific search's saved leads
   *  (admins can load any user's search here, not just their own). */
  async getSearchLeads(id) {
    return leadsApi.getSearchLeads(id);
  },

  async exportSearchLeadsCsv(searchId) {
    const data = await this.getSearchLeads(searchId);
    const headers = [
      "User Email",
      "Search Category",
      "Search Location",
      "Business Name",
      "Address",
      "Phone",
      "Website",
      "Rating",
      "Reviews",
      "Rank",
      "Searched At",
    ];
    const rows = (data.leads || []).map((lead) => [
      data.createdByEmail || "",
      data.category || "",
      data.location || "",
      lead.name || "",
      lead.address || "",
      lead.phone || "",
      lead.website || "",
      lead.rating ?? "",
      lead.reviews ?? "",
      lead.rank ?? "",
      data.createdAt || "",
    ]);
    const slug = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const query = [slug(data.category), slug(data.location)].filter(Boolean).join("_") || searchId;
    const username = String(data.createdByEmail || "user")
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");
    downloadCsvRows(`${username}_${query}_leads_${exportFilenameTimestamp()}.csv`, headers, rows);
  },

  async getExportHistory() {
    const res = await apiFetch("/admin/exports/");
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({})))?.error || "Failed to load export history",
      );
    return res.json();
  },

  async replayExport(exportId) {
    const res = await apiFetch(`/admin/exports/${exportId}/download/`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "Failed to download previous export");
    }
    return downloadResponse(res, "export.csv");
  },

  async exportAuditLogs({ dateFrom, dateTo, columns } = {}) {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (columns?.length) params.set("columns", columns.join(","));
    const query = params.toString();

    // Use the no-slash route first so the browser never follows a redirect
    // that can strip the Authorization header in some dev/proxy setups.
    const res = await apiFetch(`/admin/logs/export${query ? `?${query}` : ""}`);
    if (res.ok) return downloadResponse(res, "audit_logs.csv");

    // If a stale Django dev server is still serving an older URL configuration,
    // export the authenticated audit dataset directly in the browser instead of
    // leaving the admin with a dead export button.
    if (!res.ok) {
      const logsRes = await apiFetch("/admin/logs/");
      if (logsRes.ok) {
        const data = await logsRes.json();
        const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
        const selected = new Set(
          columns?.length ? columns : ["createdAt", "userEmail", "action", "details"],
        );
        const fields = [
          [
            "createdAt",
            "Time",
            (item) =>
              item.createdAt
                ? new Date(item.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                : "",
          ],
          ["userEmail", "User", (item) => item.userEmail || getCurrentAdminEmail()],
          ["action", "Action", (item) => item.action || ""],
          ["details", "Details", (item) => JSON.stringify(item.details || {})],
        ].filter(([key]) => selected.has(key));
        const filtered = (data.logs || []).filter((item) => {
          const when = new Date(item.createdAt);
          return (!from || when >= from) && (!to || when <= to);
        });
        downloadCsvRows(
          `audit_logs_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.csv`,
          fields.map(([, label]) => label),
          filtered.map((item) => fields.map(([, , getter]) => getter(item))),
        );
        return;
      }
    }

    const err = await res.json().catch(() => ({}));
    const statusText = res.status ? ` (HTTP ${res.status})` : "";
    throw new Error(err?.error || err?.detail || `Failed to export audit logs${statusText}`);
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
      Boolean(searchId) || format !== "csv" || (columns && columns.length) || dateFrom || dateTo;

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
        return downloadResponse(res, `${scope === "searches" ? "all_searches" : "all_leads"}.csv`);
      }
    }

    if (!res.ok) {
      // Search-specific exports can always be produced from the saved-search
      // endpoint, so do not let a stale Django export route break the button.
      if (searchId && scope === "leads") {
        return this.exportSearchLeadsCsv(searchId);
      }

      // If the server's aggregate export route is unavailable, build the same
      // CSV from the authenticated saved-search endpoints. This keeps every
      // export button functional during a backend restart/deploy.
      if (!searchId && !columns?.length && !dateFrom && !dateTo) {
        return clientExportHistory({ userId, scope });
      }

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
    return downloadResponse(
      res,
      `${scope === "searches" ? "all_searches" : "all_leads"}.${extension}`,
    );
  },

  /** Downloads both selected datasets as ONE unified CSV file. */
  async exportCombinedHistory({
    userId,
    dateFrom,
    dateTo,
    leadColumns = [],
    searchColumns = [],
  } = {}) {
    const params = new URLSearchParams({ scope: "combined" });
    if (userId) params.set("user", userId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (leadColumns.length) params.set("leadColumns", leadColumns.join(","));
    if (searchColumns.length) params.set("searchColumns", searchColumns.join(","));

    const res = await apiFetch(`/admin/export/?${params.toString()}`);
    if (res.ok) return downloadResponse(res, `data_${exportFilenameTimestamp()}.csv`);

    // Fallback for an older backend: build the same single CSV in-browser.
    const source = userId ? await this.getUserSearches(userId) : await this.getRecentSearches();
    const searches = (source.searches || []).filter((search) => {
      const when = new Date(search.createdAt).getTime();
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
      return when >= from && when <= to;
    });

    const leadDefs = {
      userEmail: [
        "User Email",
        (lead, data, search) => data.createdByEmail || search.userEmail || "",
      ],
      category: ["Search Category", (lead, data) => data.category || ""],
      location: ["Search Location", (lead, data) => data.location || ""],
      name: ["Business Name", (lead) => lead.name || ""],
      address: ["Address", (lead) => lead.address || ""],
      phone: ["Phone", (lead) => lead.phone || ""],
      website: ["Website", (lead) => lead.website || ""],
      rating: ["Rating", (lead) => lead.rating ?? ""],
      reviews: ["Reviews", (lead) => lead.reviews ?? ""],
      rank: ["Rank", (lead) => lead.rank ?? ""],
      status: ["Status", (lead) => lead.status || ""],
      createdAt: ["Searched At", (lead, data) => data.createdAt || ""],
    };
    const searchDefs = {
      userEmail: ["User Email", (search) => search.userEmail || source.user?.email || ""],
      category: ["Search Category", (search) => search.category || ""],
      location: ["Search Location", (search) => search.location || ""],
      maxResults: ["Max Results", (search) => search.maxResults ?? ""],
      scanned: ["Leads Scanned", (search) => search.scanned ?? ""],
      createdAt: ["Searched At", (search) => search.createdAt || ""],
    };
    const leadKeys = leadColumns.length ? leadColumns : Object.keys(leadDefs);
    const searchKeys = searchColumns.length ? searchColumns : Object.keys(searchDefs);
    const keys = [...new Set([...leadKeys, ...searchKeys])];
    const headers = [
      "Record Type",
      ...keys.map((key) => leadDefs[key]?.[0] || searchDefs[key]?.[0] || key),
    ];
    const rows = [];
    for (const search of searches) {
      if (!leadKeys.length) continue;
      try {
        const data = await this.getSearchLeads(search.id);
        for (const lead of data.leads || []) {
          rows.push(["Lead", ...keys.map((key) => leadDefs[key]?.[1]?.(lead, data, search) ?? "")]);
        }
      } catch {
        // Skip an unavailable search's lead payload without breaking the export.
      }
    }
    if (searchKeys.length) {
      for (const search of searches) {
        rows.push(["Search", ...keys.map((key) => searchDefs[key]?.[1]?.(search) ?? "")]);
      }
    }
    const username = String(source.user?.email || getCurrentAdminEmail() || "all")
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");
    downloadCsvRows(`${username}_data_${exportFilenameTimestamp()}.csv`, headers, rows);
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
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({})))?.error || "Failed to clear data");
    return res.json();
  },
};
