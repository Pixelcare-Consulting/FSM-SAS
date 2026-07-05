/**
 * Display label for company_memos creator embed (users + optional technicians row).
 * Prefers technicians.full_name; falls back to users.username (often email).
 * @param {{ username?: string, technicians?: unknown } | null | undefined} creator
 * @returns {string | null}
 */
export function memoCreatorDisplayName(creator) {
  if (!creator || typeof creator !== 'object') return null;
  let tech = creator.technicians;
  if (Array.isArray(tech)) tech = tech[0];
  const full = tech?.full_name != null ? String(tech.full_name).trim() : '';
  if (full) return full;
  const u = creator.username != null ? String(creator.username).trim() : '';
  return u || null;
}
