import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  notificationsCachePrefix,
  resolveNotificationSubjectIds,
} from '../../../lib/notifications/notificationSummary';
import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => (id != null ? String(id).trim() : '')).filter(Boolean))];
}

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

  const { ids, all } = req.body || {};
  const idList = normalizeIds(ids);

  if (!all && idList.length === 0) {
    return res.status(400).json({ error: 'ids or all=true is required' });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const orClause = `${subjectIds.map((id) => `worker_id.eq.${id}`).join(',')},worker_id.is.null`;

    let query = supabase
      .from('notifications')
      .update({ read: true })
      .eq('hidden', false)
      .or(orClause);

    if (all) {
      query = query.eq('read', false);
    } else {
      query = query.in('id', idList);
    }

    const { error } = await query;
    if (error) throw error;

    invalidateListCache(notificationsCachePrefix());

    return res.status(200).json({
      success: true,
      updated: all ? 'all' : idList.length,
    });
  } catch (error) {
    console.error('notifications/mark-read API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to mark notifications as read.',
    });
  }
}
