import { getSupabaseAdmin } from '../../../../../lib/supabase/server';
import { withFieldApi } from '../../../../../lib/api/withFieldApi';
import {
  loadOwnedAssignment,
  resolveTechnicianIdFromUser,
} from '../../../../../lib/field/fieldAssignmentHelpers';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  buildChanges,
} from '../../../../../lib/services/auditLog';

const JOB_DONE_OR_CANCELLED_IDS = new Set(['-1', '572', '611', '616']);
const JOB_DONE_OR_CANCELLED_KEYS = new Set(['COMPLETED', 'CANCELLED', 'CANCELED']);

function shouldSkipInProgressParentStatus(status) {
  const raw = String(status ?? '').trim();
  if (!raw) return false;
  if (JOB_DONE_OR_CANCELLED_IDS.has(raw)) return true;
  const key = raw.toUpperCase().replace(/\s+/g, '_');
  return JOB_DONE_OR_CANCELLED_KEYS.has(key);
}

/**
 * POST /api/v1/field/assignments/start
 * Body: { technicianJobId, startedAt? }
 * Sets started_at (first start only) and assignment_status=STARTED.
 * Also sets parent jobs.status to IN_PROGRESS unless already Job Done / cancelled.
 */
export default withFieldApi(async function handler(req, res, session) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const technicianId = resolveTechnicianIdFromUser(session.user);
  if (!technicianId) {
    return res.status(403).json({ error: 'No technician profile for this user' });
  }

  const technicianJobId = String(req.body?.technicianJobId || '').trim();
  const startedAtRaw = req.body?.startedAt;
  const startedAt =
    typeof startedAtRaw === 'string' && startedAtRaw.trim()
      ? startedAtRaw.trim()
      : new Date().toISOString();

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(503).json({ error: e?.message || 'Server misconfigured' });
  }

  const { assignment, error, status } = await loadOwnedAssignment(
    supabase,
    technicianJobId,
    technicianId
  );
  if (!assignment) {
    return res.status(status || 400).json({ error });
  }

  if (String(assignment.assignment_status || '').toUpperCase() === 'COMPLETED') {
    return res.status(409).json({ error: 'Assignment already completed' });
  }

  const patch = {
    assignment_status: 'STARTED',
    updated_at: new Date().toISOString(),
  };
  // Labor contract: set started_at only on first start
  if (!assignment.started_at) {
    patch.started_at = startedAt;
  }

  const { data, error: updateError } = await supabase
    .from('technician_jobs')
    .update(patch)
    .eq('id', technicianJobId)
    .select(
      'id, job_id, technician_id, assignment_status, started_at, completed_at, accumulated_hours'
    )
    .single();

  if (updateError) {
    console.error('[field/assignments/start]', updateError.message);
    return res.status(500).json({ error: updateError.message });
  }

  const jobId = data?.job_id || assignment.job_id;
  if (jobId) {
    const { data: jobRow, error: jobLoadError } = await supabase
      .from('jobs')
      .select('id, status, job_number')
      .eq('id', jobId)
      .maybeSingle();

    if (jobLoadError) {
      console.error('[field/assignments/start] load job', jobLoadError.message);
    } else if (jobRow && !shouldSkipInProgressParentStatus(jobRow.status)) {
      const previousStatus = jobRow.status;
      if (String(previousStatus || '').trim().toUpperCase().replace(/\s+/g, '_') !== 'IN_PROGRESS') {
        const { error: jobUpdateError } = await supabase
          .from('jobs')
          .update({ status: 'IN_PROGRESS' })
          .eq('id', jobId);

        if (jobUpdateError) {
          console.error('[field/assignments/start] job status', jobUpdateError.message);
        } else {
          const tech = session.user?.technicians;
          const techRow = Array.isArray(tech) ? tech[0] : tech;
          void writeAuditLogFromRequest(req, {
            action: AUDIT_ACTIONS.JOB_UPDATE,
            category: AUDIT_CATEGORIES.JOB,
            entityType: 'job',
            entityId: jobId,
            entityLabel: jobRow.job_number || jobId,
            description: 'Job status set to In Progress when technician started work',
            details: { source: 'field_assignment_start' },
            changes: buildChanges({ status: previousStatus }, { status: 'IN_PROGRESS' }),
            status: AUDIT_STATUS.SUCCESS,
            userId: session.user?.id || undefined,
            userEmail: session.user?.username || undefined,
            userName: techRow?.full_name || session.user?.username || undefined,
          });
        }
      }
    }
  }

  return res.status(200).json({ ok: true, assignment: data });
});
