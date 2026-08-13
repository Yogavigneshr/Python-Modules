// Exports the currently-shown leads table to CSV, Excel (.xlsx), or PDF.
// Used by the "Export" dropdown on the LeadFinderPage results panel.

const COLUMNS = [
  { header: "Rank", get: (l) => l.rank },
  { header: "Name", get: (l) => l.name },
  { header: "Address", get: (l) => l.address },
  { header: "Phone", get: (l) => l.phone },
  { header: "Website", get: (l) => l.website },
  { header: "Rating", get: (l) => l.rating },
  { header: "Reviews", get: (l) => l.reviews },
  { header: "Maps", get: (l) => l.maps || l.maps_url || "" },
  { header: "Searched At", get: (l, formatTimestamp) => (formatTimestamp ? formatTimestamp(l.createdAt) : l.createdAt || "") },
];

/** Turns "Unisex Salon" + "Guindy, Chennai" + an ISO date into a safe,
 * descriptive filename base, e.g.
 * "username_unisex-salon_guindy-chennai_2026-08-10_1432". */
function buildFilenameBase(meta) {
  const slug = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const username = slug(meta?.username || "user") || "user";
  const parts = [username];
  const category = slug(meta?.category);
  const location = slug(meta?.location);
  if (category) parts.push(category);
  if (location) parts.push(location);

  // Use the actual export time so every download gets a unique, current
  // date/time suffix while preserving the existing username/query details.
  const validDate = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${validDate.getFullYear()}-${pad(validDate.getMonth() + 1)}-${pad(validDate.getDate())}`;
  const time = `${pad(validDate.getHours())}${pad(validDate.getMinutes())}`;
  parts.push(`${stamp}_${time}`);

  return parts.join("_");
}

/** Triggers a browser download for an in-memory Blob. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // The anchor must actually be in the DOM for `.click()` to reliably
  // trigger a download in every browser (notably Firefox).
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick, after the browser has picked up the
  // download - revoking immediately can produce an empty/broken file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function rowsFor(leads, formatTimestamp) {
  return leads.map((lead) => COLUMNS.map((col) => col.get(lead, formatTimestamp)));
}

function exportCsv(leads, formatTimestamp, meta) {
  const header = COLUMNS.map((c) => c.header).join(",");
  const body = rowsFor(leads, formatTimestamp).map((row) =>
    row.map((cell) => csvCell(cell)).join(","),
  );
  const csv = [header, ...body].join("\n");
  // Prefix with a UTF-8 BOM so Excel opens accented characters correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${buildFilenameBase(meta)}.csv`);
}

async function exportExcel(leads, formatTimestamp, meta) {
  const XLSX = await import("xlsx");
  const rows = leads.map((lead) => {
    const row = {};
    COLUMNS.forEach((col) => {
      row[col.header] = col.get(lead, formatTimestamp) ?? "";
    });
    return row;
  });
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = COLUMNS.map((c) => ({
    wch: Math.max(c.header.length + 2, 14),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  XLSX.writeFile(workbook, `${buildFilenameBase(meta)}.xlsx`);
}

async function exportPdf(leads, formatTimestamp, meta) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const exportedAt = new Date();
  const queryLabel = [meta?.category, meta?.location].filter(Boolean).join(" · ");

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("LeadFinder Results", 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(110);
  const subtitle = [queryLabel || null, `Exported ${exportedAt.toLocaleString()}`, `${leads.length} leads`]
    .filter(Boolean)
    .join(" · ");
  doc.text(subtitle, 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [COLUMNS.map((c) => c.header)],
    body: rowsFor(leads, formatTimestamp),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 2: { cellWidth: 55 } },
    // Footer timestamp on every page, so it survives printing too.
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Generated ${exportedAt.toLocaleString()}`, 14, pageHeight - 8);
    },
  });

  doc.save(`${buildFilenameBase(meta)}.pdf`);
}

/**
 * Exports the given leads as "csv" | "excel" | "pdf".
 * `formatTimestamp` is passed in so the export uses the exact same
 * date/time formatting shown on screen. `meta` ({ category, location,
 * timestamp }) is used to name the downloaded file, e.g.
 * "username_unisex-salon_guindy-chennai_2026-08-13_174012.csv".
 */
export async function exportLeads(format, leads, formatTimestamp, meta) {
  if (!leads || leads.length === 0) return;
  if (format === "excel") return exportExcel(leads, formatTimestamp, meta);
  if (format === "pdf") return exportPdf(leads, formatTimestamp, meta);
  return exportCsv(leads, formatTimestamp, meta);
}
