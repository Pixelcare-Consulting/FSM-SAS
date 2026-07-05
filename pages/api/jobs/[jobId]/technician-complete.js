import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { jobService } from '../../../../lib/supabase/database';
import { requestAppOrigin } from '../../../../lib/email/jobEmailContext';
import { sendJobCompletedNotification } from '../../../../lib/email/sendJobCompletedNotification';
import { isJobStatusCompleted } from '../../../../lib/jobs/isJobStatusCompleted';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  buildChanges,
} from '../../../../lib/services/auditLog';

/**
 * POST /api/jobs/[jobId]/technician-complete
 * Called after mobile technician sign-off (or via Supabase webhook on job_signatures INSERT).
 * Ensures job status reflects completion and sends the job-completed customer email once.
 */
export default async function handler(req, res) {
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

  const job = await jobService.findById(jobId, supabase);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const technicianJobs = job.technician_jobs || [];
  const technicianJobIds = technicianJobs.map((tj) => tj.id).filter(Boolean);

  let signatures = [];
  if (technicianJobIds.length > 0) {
    const { data: sigRows, error: sigErr } = await supabase
      .from('job_signatures')
      .select('id, technician_job_id, signed_at')
      .in('technician_job_id', technicianJobIds);

    if (sigErr) {
      console.error('[technician-complete] job_signatures', sigErr.message);
      return res.status(500).json({ error: 'Failed to load signatures' });
    }
    signatures = sigRows || [];
  }

  const hasSignature = signatures.length > 0;
  const hasCompletedAssignment = technicianJobs.some(
    (tj) => String(tj.assignment_status || '').toUpperCase() === 'COMPLETED'
  );
  const statusComplete = isJobStatusCompleted(job.status);
  const eligible = hasSignature || hasCompletedAssignment || statusComplete;

  if (!eligible) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'not_eligible' });
  }

  const shouldUpdateStatus = !statusComplete && (hasSignature || hasCompletedAssignment);

  if (shouldUpdateStatus) {
    try {
      const previousStatus = job.status;
      await jobService.update(jobId, { status: '-1' }, supabase);
      const emailResult = await sendJobCompletedNotification({
        supabase,
        jobId,
        previousStatus,
        appOrigin: requestAppOrigin(req),
        req,
      });
      void writeAuditLogFromRequest(req, {
        action: AUDIT_ACTIONS.JOB_UPDATE,
        category: AUDIT_CATEGORIES.JOB,
        entityType: 'job',
        entityId: jobId,
        entityLabel: job.job_number || jobId,
        description: 'Job marked complete after technician sign-off',
        details: { statusUpdated: true, emailOk: emailResult.ok },
        changes: buildChanges({ status: previousStatus }, { status: '-1' }),
        status: AUDIT_STATUS.SUCCESS,
      });
      return res.status(200).json({
        ok: emailResult.ok,
        skipped: emailResult.skipped,
        reason: emailResult.reason || 'status_updated',
        error: emailResult.error,
        messageId: emailResult.messageId,
        statusUpdated: true,
      });
    } catch (e) {
      console.error('[technician-complete] status update', e);
      return res.status(500).json({ error: e?.message || 'Failed to update job status' });
    }
  }

  const emailResult = await sendJobCompletedNotification({
    supabase,
    jobId,
    previousStatus: undefined,
    appOrigin: requestAppOrigin(req),
    req,
  });

  return res.status(200).json({
    ok: emailResult.ok,
    skipped: emailResult.skipped,
    reason: emailResult.reason,
    error: emailResult.error,
    messageId: emailResult.messageId,
    statusUpdated: false,
  });
}
