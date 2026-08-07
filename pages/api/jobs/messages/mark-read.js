import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { withSession } from '../../../../lib/api/withSession';
import {
  JOB_MESSAGE_READS_CACHE_PREFIX,
  markJobMessagesRead,
  markJobThreadRead,
} from '../../../../lib/jobs/jobMessageReads';
import { invalidateListCache } from '../../../../lib/supabase/listQueryHelpers';

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => (id != null ? String(id).trim() : '')).filter(Boolean))];
}

export default withSession(async function handler(req, res, session) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { messageIds, jobId } = req.body || {};
  const idList = normalizeIds(messageIds);
  const jobIdStr = jobId != null ? String(jobId).trim() : '';

  if (!jobIdStr && idList.length === 0) {
    return res.status(400).json({ error: 'messageIds or jobId is required' });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    let result;
    if (jobIdStr) {
      result = await markJobThreadRead(supabase, userId, jobIdStr);
    } else {
      result = await markJobMessagesRead(supabase, userId, idList);
    }

    invalidateListCache(JOB_MESSAGE_READS_CACHE_PREFIX);
    invalidateListCache('job-messages-summary:');

    return res.status(200).json({
      success: true,
      marked: result.marked,
    });
  } catch (error) {
    console.error('jobs/messages/mark-read API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to mark messages as read.',
    });
  }
});
