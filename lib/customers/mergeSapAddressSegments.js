/**
 * SAP / SQL Query 14 address rows often repeat the same comma-separated clause
 * across Address1–Address3, Street, and Building (or repeat inside one field).
 * Produces one display line: split on commas, trim, drop duplicates (case-insensitive),
 * preserve order.
 *
 * @param {(string|null|undefined)[]} rawValues SAP address fields in display order.
 * @returns {string}
 */
export function mergeSapAddressFieldsDeduped(rawValues) {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(rawValues)) return '';
  for (const raw of rawValues) {
    if (raw == null || raw === '') continue;
    const str = String(raw);
    if (!str.trim()) continue;
    for (const piece of str.split(',')) {
      const s = piece.trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.join(', ');
}
