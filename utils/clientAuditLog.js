/**
 * Client-side audit log helper — posts to /api/audit-logs.
 * Use after successful portal actions (job edits, settings changes, etc.).
 */

/**
 * Build a changes object from before/after snapshots (only differing keys).
 * Client-safe mirror of lib/services/auditLog.buildChanges.
 */
export function buildAuditChanges(before = {}, after = {}) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { before: b ?? null, after: a ?? null };
    }
  }
  return Object.keys(changes).length ? changes : null;
}

export async function clientAuditLog({
  action,
  category = 'system',
  entityType = null,
  entityId = null,
  entityLabel = null,
  description = null,
  details = {},
  changes = null,
  status = 'success',
  source = 'portal',
  userId = null,
  userEmail = null,
  userName = null,
} = {}) {
  if (!action) return;

  try {
    const Cookies = (await import('js-cookie')).default;
    const uid = userId || Cookies.get('uid') || null;
    const email = userEmail || Cookies.get('email') || null;
    const name = userName || Cookies.get('fullName') || null;

    await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        action,
        category,
        entityType,
        entityId,
        entityLabel,
        description,
        details,
        changes,
        status,
        source,
        userId: uid,
        userEmail: email,
        userName: name,
      }),
    });
  } catch (err) {
    console.error('[clientAuditLog]', err);
  }
}
