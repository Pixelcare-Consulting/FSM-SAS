/** Matches rows from masterlist PATCH (placeholder names). */
export const stripMasterlistNamePlaceholder = (s) => {
  const t = String(s || "").trim();
  if (t === "-" || t === "—") return "";
  return t;
};

/** Collapse duplicate contact rows (same person repeated per site / import). */
export const dedupeMasterlistContactRows = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) =>
    String(a.id || "").localeCompare(String(b.id || ""))
  );
  const seen = new Set();
  const out = [];
  for (const row of sorted) {
    const fn = stripMasterlistNamePlaceholder(row.first_name);
    const mn = stripMasterlistNamePlaceholder(row.middle_name);
    const ln = stripMasterlistNamePlaceholder(row.last_name);
    const t1 = String(row.tel1 ?? "").trim().toLowerCase();
    const t2 = String(row.tel2 ?? "").trim().toLowerCase();
    const em = String(row.email ?? "").trim().toLowerCase();
    const key = [fn, mn, ln, t1, t2, em].join("\u001f");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};

/** Build react-select options from public.contacts (masterlist). */
export default function mapDbContactsToSelectOptions(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return dedupeMasterlistContactRows(rows).map((row) => {
    const fn = stripMasterlistNamePlaceholder(row.first_name);
    const mn = stripMasterlistNamePlaceholder(row.middle_name);
    const ln = stripMasterlistNamePlaceholder(row.last_name);
    const display = [fn, mn, ln].filter(Boolean).join(" ").trim();
    const siteTag = row.customer_location_id ? " · site" : "";
    const label = (display || "Contact") + siteTag;
    return {
      value: row.id,
      label,
      contactId: row.id,
      firstName: fn,
      middleName: mn,
      lastName: ln,
      tel1: row.tel1,
      tel2: row.tel2,
      email: row.email,
    };
  });
}
