import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { withSession } from '../../../../lib/api/withSession';
import {
  JOB_MESSAGE_READS_CACHE_PREFIX,
  countUnreadJobMessages,
} from '../../../../lib/jobs/jobMessageReads';
import { getListCache, setListCache, logResponseSize } from '../../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 15000;

export default withSession(async function handler(req, res, session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=15');

  const userId = session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const jobId = String(req.query.jobId || '').trim() || null;
  const senderType = String(req.query.senderType || '').trim().toUpperCase() || null;

  const cacheKey = `${JOB_MESSAGE_READS_CACHE_PREFIX}:count:${userId}:${jobId || ''}:${senderType || ''}`;
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('jobs/messages/unread-count (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const unreadCount = await countUnreadJobMessages(supabase, userId, {
      jobId,
      senderType,
    });

    const payload = {
      unreadCount,
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('jobs/messages/unread-count', payload);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('jobs/messages/unread-count API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to load unread count.',
    });
  }
});
