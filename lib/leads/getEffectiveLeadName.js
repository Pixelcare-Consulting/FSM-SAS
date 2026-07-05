/**
 * Resolve the effective display name for a lead.
 * Prefers non-empty full_name/fullName (CSO edits), else joined first/last, else fallback.
 */
export function getEffectiveLeadName(lead) {
  if (!lead) return 'Unknown Customer';

  const fullName = String(lead.full_name || lead.fullName || '').trim();
  if (fullName) return fullName;

  const firstName = String(lead.first_name || lead.firstName || '').trim();
  const lastName = String(lead.last_name || lead.lastName || '').trim();
  const joined = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (joined) return joined;

  return 'Unknown Customer';
}
