/**
 * Map portal job_schedule rows to SAP U_API_JOB_SCHEDULE date/time fields.
 */

/** @param {string|Date|null} dateVal */
export function dateToSapScheduleIso(dateVal) {
  if (!dateVal) return null;
  const s = String(dateVal).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return `${s}T00:00:00Z`;
}

/** TIME or "HH:mm:ss" → Postman "HHmm" */
export function timeToSapHhmm(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}${m[2]}`;
  if (/^\d{3,4}$/.test(raw)) return raw.padStart(4, "0").slice(-4);
  return null;
}

export function pickPrimaryScheduleRow(jobScheduleRows = []) {
  const rows = (jobScheduleRows || []).filter(Boolean);
  if (!rows.length) return null;
  return rows.sort((a, b) => String(a.jsdate || "").localeCompare(String(b.jsdate || "")))[0];
}
