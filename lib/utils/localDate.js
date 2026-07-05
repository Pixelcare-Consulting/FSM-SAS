/**
 * Local calendar YYYY-MM-DD from a Date or parseable timestamp.
 * Prefer this over Date#toISOString().split('T')[0], which uses UTC and can
 * shift the calendar day in zones ahead of UTC (e.g. Singapore UTC+8).
 */
export function toLocalYmd(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
