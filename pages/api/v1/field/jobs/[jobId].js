import { getSupabaseAdmin } from '../../../../../lib/supabase/server';
import { withFieldApi } from '../../../../../lib/api/withFieldApi';
import { resolveTechnicianIdFromUser } from '../../../../../lib/field/fieldAssignmentHelpers';

const FIELD_JOB_DETAIL_SELECT = `
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
  contact_id,
  customer:customer_id(id, customer_name, customer_code, email, phone_number),
  location:location_id(id, location_name, current_latitude, current_longitude),
  contact:contact_id(id, first_name, last_name, tel1, tel2, email)
`;

/**
 * GET /api/v1/field/jobs/[jobId]
 * Slim job + this technician's assignment (ownership enforced).
 */
export default withFieldApi(async function handler(req, res, session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const technicianId = resolveTechnicianIdFromUser(session.user);
  if (!technicianId) {
    return res.status(403).json({ error: 'No technician profile for this user' });
  }

  const { jobId } = req.query;
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'jobId is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(503).json({ error: e?.message || 'Server misconfigured' });
  }

  let jobQuery = supabase
    .from('jobs')
    .select(FIELD_JOB_DETAIL_SELECT)
    .is('deleted_at', null);

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      jobId
    );
  if (isUuid) {
    jobQuery = jobQuery.eq('id', jobId);
  } else {
    jobQuery = jobQuery.eq('job_number', jobId);
  }

  const { data: job, error: jobError } = await jobQuery.maybeSingle();
  if (jobError) {
    console.error('[field/jobs/[jobId]]', jobError.message);
    return res.status(500).json({ error: jobError.message });
  }
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { data: assignment, error: aErr } = await supabase
    .from('technician_jobs')
    .select(
      'id, job_id, technician_id, assignment_status, started_at, completed_at, accumulated_hours, technician_remarks, service_notes'
    )
    .eq('job_id', job.id)
    .eq('technician_id', technicianId)
    .is('deleted_at', null)
    .maybeSingle();

  if (aErr) {
    console.error('[field/jobs/[jobId]] assignment', aErr.message);
    return res.status(500).json({ error: aErr.message });
  }

  if (!assignment) {
    return res.status(403).json({ error: 'Forbidden — not assigned to this job' });
  }

  const { data: signature } = await supabase
    .from('job_signatures')
    .select('id, technician_job_id, customer_name, signed_at, created_at')
    .eq('technician_job_id', assignment.id)
    .maybeSingle();

  return res.status(200).json({
    job,
    assignment,
    signature: signature || null,
  });
});
