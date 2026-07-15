import { jobService } from '../supabase/database';
import { requestAppOrigin } from '../email/jobEmailContext';
import { sendJobCompletedNotification } from '../email/sendJobCompletedNotification';
import { isJobStatusCompleted } from './isJobStatusCompleted';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  buildChanges,
} from '../services/auditLog';

/**
 * Shared job completion + customer email path used by
 * POST /api/jobs/[jobId]/technician-complete and POST /api/field/assignments/complete.
 *
 * @param {{
 *   supabase: object,
 *   jobId: string,
 *   req: import('next').NextApiRequest,
 * }} args
 * @returns {Promise<{
 *   ok: boolean,
 *   skipped?: boolean,
 *   reason?: string,
 *   error?: string,
 *   messageId?: string,
 *   statusUpdated?: boolean,
 *   httpStatus?: number,
 * }>}
 */
export async function runTechnicianCompleteFlow({ supabase, jobId, req }) {
  const job = await jobService.findById(jobId, supabase);
  if (!job) {
    return { ok: false, error: 'Job not found', httpStatus: 404 };
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
      console.error('[runTechnicianCompleteFlow] job_signatures', sigErr.message);
      return { ok: false, error: 'Failed to load signatures', httpStatus: 500 };
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
    return { ok: true, skipped: true, reason: 'not_eligible', statusUpdated: false };
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
      return {
        ok: emailResult.ok,
        skipped: emailResult.skipped,
        reason: emailResult.reason || 'status_updated',
        error: emailResult.error,
        messageId: emailResult.messageId,
        statusUpdated: true,
      };
    } catch (e) {
      console.error('[runTechnicianCompleteFlow] status update', e);
      return {
        ok: false,
        error: e?.message || 'Failed to update job status',
        httpStatus: 500,
      };
    }
  }

  const emailResult = await sendJobCompletedNotification({
    supabase,
    jobId,
    previousStatus: undefined,
    appOrigin: requestAppOrigin(req),
    req,
  });

  return {
    ok: emailResult.ok,
    skipped: emailResult.skipped,
    reason: emailResult.reason,
    error: emailResult.error,
    messageId: emailResult.messageId,
    statusUpdated: false,
  };
}
