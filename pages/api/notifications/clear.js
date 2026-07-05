import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  notificationsCachePrefix,
  resolveNotificationSubjectIds,
} from '../../../lib/notifications/notificationSummary';
import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const subjectIds = resolveNotificationSubjectIds(req, session);
  if (!subjectIds.length) {
    return res.status(400).json({ error: 'No notification subject ids' });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { error, count } = await supabase
      .from('notifications')
      .delete()
      .in('worker_id', subjectIds)
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    invalidateListCache(notificationsCachePrefix());

    return res.status(200).json({
      success: true,
      deleted: count ?? 0,
    });
  } catch (error) {
    console.error('notifications/clear API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to clear notifications.',
    });
  }
}
