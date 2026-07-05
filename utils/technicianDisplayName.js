function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@');
}

/**
 * Canonical worker/technician display name. Matches worker list (`full_name` when it is the richer value).
 * When name parts only repeat last name but `full_name` has the full synced label, `full_name` wins.
 */
export function buildTechnicianDisplayName(technician, user = null) {
  if (!technician) {
    const u = user?.username;
    if (u && !looksLikeEmail(u)) return u;
    return user?.email || 'Technician';
  }

  const fn = technician.full_name?.trim() || '';
  const parts = [
    technician.first_name,
    technician.middle_name,
    technician.last_name,
  ].filter(Boolean);
  const fromParts = parts.length > 0 ? parts.join(' ') : '';

  if (fn && fromParts) {
    if (fromParts === fn) return fn;
    const fnWords = fn.split(/\s+/).filter(Boolean).length;
    const pWords = fromParts.split(/\s+/).filter(Boolean).length;
    if (fnWords > pWords) return fn;
    if (pWords > fnWords) return fromParts;
    return fn.length >= fromParts.length ? fn : fromParts;
  }
  if (fn) return fn;
  if (fromParts) return fromParts;

  const username = user?.username ?? technician.user?.username;
  if (username && !looksLikeEmail(username)) return username;
  return 'Technician';
}
