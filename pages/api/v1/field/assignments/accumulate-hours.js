import { getSupabaseAdmin } from '../../../../../lib/supabase/server';
import { withFieldApi } from '../../../../../lib/api/withFieldApi';
import {
  loadOwnedAssignment,
  resolveTechnicianIdFromUser,
} from '../../../../../lib/field/fieldAssignmentHelpers';

/**
 * POST /api/v1/field/assignments/accumulate-hours
 * Body: { technicianJobId, sessionHours } — adds to accumulated_hours (multi-day).
 * Does not clear started_at or set completed_at (labor contract).
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
  const sessionHours = Number(req.body?.sessionHours);

  if (!Number.isFinite(sessionHours) || sessionHours <= 0) {
    return res.status(400).json({ error: 'sessionHours must be a positive number' });
  }

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

  const previous = Number(assignment.accumulated_hours) || 0;
  const nextHours = Math.round((previous + sessionHours) * 10000) / 10000;

  const { data, error: updateError } = await supabase
    .from('technician_jobs')
    .update({
      accumulated_hours: nextHours,
      updated_at: new Date().toISOString(),
    })
    .eq('id', technicianJobId)
    .select(
      'id, job_id, technician_id, assignment_status, started_at, completed_at, accumulated_hours'
    )
    .single();

  if (updateError) {
    console.error('[field/assignments/accumulate-hours]', updateError.message);
    return res.status(500).json({ error: updateError.message });
  }

  return res.status(200).json({
    ok: true,
    assignment: data,
    previousAccumulatedHours: previous,
    sessionHours,
  });
});
