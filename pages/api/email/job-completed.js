import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { requestAppOrigin } from '../../../lib/email/jobEmailContext';
import { sendJobCompletedNotification } from '../../../lib/email/sendJobCompletedNotification';

/**
 * POST /api/email/job-completed
 * Body: { jobId: string, previousStatus?: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { jobId, previousStatus, force } = req.body || {};
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'jobId is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.warn('[job-completed]', e?.message);
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  const result = await sendJobCompletedNotification({
    supabase,
    jobId,
    previousStatus,
    force: force === true,
    appOrigin: requestAppOrigin(req),
    req,
  });

  if (result.error === 'Job not found') {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (result.error && !result.skipped) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    error: result.error,
    messageId: result.messageId,
  });
}
