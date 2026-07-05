/**
 * Choose a masterlist `contacts` row for a job site — same rules as ServiceLocationTab / job detail.
 * Priority: contacts linked to matched customer_location, then other sites, then customer-level only.
 */

export function pickMasterlistContactRow(rows, siteIdPriority = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const seen = new Set();
  for (const siteId of siteIdPriority) {
    const k = siteId != null ? String(siteId).trim() : "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const hit = rows.find(
      (r) => r.customer_location_id != null && String(r.customer_location_id) === k
    );
    if (hit) return hit;
  }
  return rows.find((r) => r.customer_location_id == null) || null;
}

const stripPlaceholder = (s) => {
  const t = String(s || "").trim();
  if (t === "-" || t === "—") return "";
  return t;
};

/** Flat shape for scheduler / lightweight UIs */
export function masterlistContactRowToSchedulerFields(row) {
  if (!row) return null;
  const fn = stripPlaceholder(row.first_name);
  const mn = stripPlaceholder(row.middle_name);
  const ln = stripPlaceholder(row.last_name);
  const name = [fn, mn, ln].filter(Boolean).join(" ").trim();
  return {
    siteContactName: name,
    siteContactPhone: row.tel1 != null ? String(row.tel1).trim() : "",
    siteContactMobile: row.tel2 != null ? String(row.tel2).trim() : "",
    siteContactEmail: row.email != null ? String(row.email).trim() : "",
    siteContactId: row.id || null,
  };
}
