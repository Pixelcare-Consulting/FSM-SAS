import { getSupabaseAdmin } from '../../../../../lib/supabase/server';
import { withFieldApi } from '../../../../../lib/api/withFieldApi';
import { resolveTechnicianIdFromUser } from '../../../../../lib/field/fieldAssignmentHelpers';

const FIELD_JOB_LIST_SELECT = `
  id,
  job_number,
  status,
  priority,
  title,
  description,
  scheduled_start,
  scheduled_end,
  customer_id,
  location_id,
  customer:customer_id(id, customer_name, customer_code),
  location:location_id(id, location_name)
`;

/**
 * GET /api/v1/field/jobs?from=&to=&limit=
 * Slim list of jobs assigned to the authenticated technician in an optional date window.
 * Always includes meta.technicianId / assignmentCount / matchedJobCount for empty-list diagnosis.
 */
export default withFieldApi(async function handler(req, res, session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const technicianId = resolveTechnicianIdFromUser(session.user);
  if (!technicianId) {
    return res.status(403).json({ error: 'No technician profile for this user' });
  }

  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 200);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(503).json({ error: e?.message || 'Server misconfigured' });
  }

  const { data: assignments, error: aErr } = await supabase
    .from('technician_jobs')
    .select(
      'id, job_id, technician_id, assignment_status, started_at, completed_at, accumulated_hours'
    )
    .eq('technician_id', technicianId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (aErr) {
    console.error('[field/jobs]', aErr.message);
    return res.status(500).json({ error: aErr.message });
  }

  const assignmentRows = assignments || [];
  const jobIds = [...new Set(assignmentRows.map((a) => a.job_id).filter(Boolean))];
  let jobsById = {};
  if (jobIds.length > 0) {
    let jobsQuery = supabase
      .from('jobs')
      .select(FIELD_JOB_LIST_SELECT)
      .in('id', jobIds)
      .is('deleted_at', null);
    if (from) jobsQuery = jobsQuery.gte('scheduled_start', from);
    if (to) jobsQuery = jobsQuery.lte('scheduled_start', to);
    const { data: jobs, error: jErr } = await jobsQuery;
    if (jErr) {
      console.error('[field/jobs] jobs', jErr.message);
      return res.status(500).json({ error: jErr.message });
    }
    jobsById = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
  }

  const jobs = assignmentRows
    .map((a) => ({
      assignment: {
        id: a.id,
        job_id: a.job_id,
        technician_id: a.technician_id,
        assignment_status: a.assignment_status,
        started_at: a.started_at,
        completed_at: a.completed_at,
        accumulated_hours: a.accumulated_hours,
      },
      job: jobsById[a.job_id] || null,
    }))
    .filter((row) => row.job);

  return res.status(200).json({
    jobs,
    meta: {
      technicianId,
      assignmentCount: assignmentRows.length,
      matchedJobCount: jobs.length,
    },
  });
});
