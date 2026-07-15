import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { withApiMetrics } from '../../../../lib/api/withApiMetrics';
import { runTechnicianCompleteFlow } from '../../../../lib/jobs/runTechnicianCompleteFlow';

/**
 * POST /api/jobs/[jobId]/technician-complete
 * Called after mobile technician sign-off (or via Supabase webhook on job_signatures INSERT).
 * Ensures job status reflects completion and sends the job-completed customer email once.
 *
 * Prefer POST /api/field/assignments/complete for new mobile clients (write + complete in one call).
 */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { jobId } = req.query;
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'jobId is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.warn('[technician-complete]', e?.message);
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  const result = await runTechnicianCompleteFlow({ supabase, jobId, req });

  if (result.httpStatus && result.httpStatus >= 400) {
    return res.status(result.httpStatus).json({
      error: result.error || 'Completion failed',
      ok: false,
    });
  }

  return res.status(200).json({
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    error: result.error,
    messageId: result.messageId,
    statusUpdated: result.statusUpdated,
  });
}

export default withApiMetrics(handler);
