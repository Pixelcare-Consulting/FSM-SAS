/**
 * Format AIFM service_location for DB / jobs.description tags (import + assign flows).
 */

/**
 * Build a display-ready location string from the enriched AIFM service_location object.
 * Returns null when no meaningful address data is present.
 *
 * @param {{ service_location?: { flat_number?: string, street_address?: string, city?: string, state?: string, zip?: string, nick_name?: string } }} job
 * @returns {string|null}
 */
export function formatAifmLocation(job) {
  const loc = job?.service_location;
  if (!loc) return null;
  const parts = [
    [loc.flat_number, loc.street_address].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
    loc.city,
    loc.state,
    loc.zip,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : (loc.nick_name || null);
}

/**
 * Sanitize a value before embedding in jobs.description as [TAG:...].
 * Removes `]` and newlines so extractTag() does not truncate early.
 *
 * @param {string} s
 * @returns {string}
 */
export function sanitizeAifmEmbeddedTagValue(s) {
  return String(s || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
