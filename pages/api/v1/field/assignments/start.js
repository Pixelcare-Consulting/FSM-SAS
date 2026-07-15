import { getSupabaseAdmin } from '../../../../../lib/supabase/server';
import { withFieldApi } from '../../../../../lib/api/withFieldApi';
import {
  loadOwnedAssignment,
  resolveTechnicianIdFromUser,
} from '../../../../../lib/field/fieldAssignmentHelpers';

/**
 * POST /api/v1/field/assignments/start
 * Body: { technicianJobId, startedAt? }
 * Sets started_at (first start only) and assignment_status=STARTED.
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

  return res.status(200).json({ ok: true, assignment: data });
});
