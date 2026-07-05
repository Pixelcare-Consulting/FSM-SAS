export const NOTIFICATIONS_SUMMARY_SELECT =
  'id, type, title, message, read, created_at, worker_id, action_href';

const CACHE_PREFIX = 'notifications:';

/**
 * Resolve `notifications.worker_id` subject ids from session + cookies.
 * Mirrors QuickMenu `notificationSubjectIds` (uid vs workerId may differ).
 */
export function resolveNotificationSubjectIds(req, session) {
  const ids = [];
  if (session?.user?.id) ids.push(session.user.id);
  if (req.cookies?.uid) ids.push(req.cookies.uid);
  if (req.cookies?.workerId) ids.push(req.cookies.workerId);
  return [...new Set(ids.filter(Boolean))];
}

export function buildNotificationsCacheKey(subjectIds, limit = 20) {
  const sorted = [...subjectIds].sort().join(',');
  return `${CACHE_PREFIX}${sorted}:${limit}`;
}

export function notificationsCachePrefix() {
  return CACHE_PREFIX;
}
