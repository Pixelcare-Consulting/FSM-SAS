/**
 * POST /api/notifications/job-stakeholders
 * Notify assigned technicians (users.id) and all active ADMIN users when jobs are created,
 * reassigned, or updated. Uses service role so inserts succeed regardless of client RLS/session.
 *
 * Body: {
 *   jobId, jobNumber?, jobTitle?, assigneeUserIds?: string[],
 *   kind?: 'new'|'reassigned'|'updated',
 *   updateSummary?: string (for kind 'updated'),
 *   createdByUserId?: string
 * }
 */
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { notificationsCachePrefix } from '../../../lib/notifications/notificationSummary';
import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';

async function fetchJobAssigneeUserIds(supabase, jobId) {
  const { data: tj, error } = await supabase
    .from('technician_jobs')
    .select('technician_id')
    .eq('job_id', jobId)
    .is('deleted_at', null);
  if (error) {
    console.warn('job-stakeholders: fetchJobAssigneeUserIds', error.message);
    return [];
  }
  const techIds = [...new Set((tj || []).map((r) => r.technician_id).filter(Boolean))];
  if (!techIds.length) return [];
  const { data: techs, error: tErr } = await supabase
    .from('technicians')
    .select('user_id')
    .in('id', techIds)
    .is('deleted_at', null);
  if (tErr) {
    console.warn('job-stakeholders: technicians lookup', tErr.message);
    return [];
  }
  return [...new Set((techs || []).map((t) => t.user_id).filter(Boolean))];
}

function buildRowsNewOrReassign({ recipients, assigneeSet, jobId, jobNumber, jobTitle, kind }) {
  const isReassign = kind === 'reassigned';
  const label = jobNumber || String(jobId).slice(0, 8);
  const subtitle = (jobTitle || '').trim() || 'Open the job for details';
  const actionHref = jobId ? `/dashboard/jobs/${jobId}` : null;

  return recipients.map((worker_id) => {
    const forAssignee = assigneeSet.has(worker_id);
    const title = isReassign
      ? 'Assigned to a job'
      : forAssignee
        ? 'New job assigned'
        : 'New job created';
    const message = isReassign
      ? `${label} — ${subtitle}`
      : forAssignee
        ? `${label} — ${subtitle}`
        : `A new job was created: ${label} — ${subtitle}`;
    const type = isReassign ? 'job_reassigned' : forAssignee ? 'job_assigned' : 'job_created';

    return {
      worker_id,
      title,
      message,
      type,
      read: false,
      hidden: false,
      action_href: actionHref,
    };
  });
}

function buildRowsUpdated({ recipients, jobId, jobNumber, jobTitle, updateSummary }) {
  const label = jobNumber || String(jobId).slice(0, 8);
  const summary = (updateSummary || 'Job details were updated').trim();
  const subtitle = (jobTitle || '').trim() || 'Open the job for details';
  const actionHref = jobId ? `/dashboard/jobs/${jobId}` : null;

  return recipients.map((worker_id) => ({
    worker_id,
    title: 'Job updated',
    message: `${label} — ${summary} (${subtitle})`,
    type: 'job_updated',
    read: false,
    hidden: false,
    action_href: actionHref,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uid = req.cookies?.uid || req.cookies?.workerId;
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.warn('job-stakeholders: Supabase admin not configured', e?.message);
    return res.status(503).json({ error: 'Notifications service unavailable' });
  }

  const {
    jobId,
    jobNumber,
    jobTitle,
    assigneeUserIds = [],
    kind = 'new',
    updateSummary,
    createdByUserId: _createdBy,
  } = req.body || {};

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  const normalizedKind = kind === 'reassigned' ? 'reassigned' : kind === 'updated' ? 'updated' : 'new';

  let assignees = [...new Set((Array.isArray(assigneeUserIds) ? assigneeUserIds : []).filter(Boolean))];

  if (normalizedKind === 'updated') {
    const fromDb = await fetchJobAssigneeUserIds(supabase, jobId);
    assignees = [...new Set([...assignees, ...fromDb])];
  }

  const assigneeSet = new Set(assignees);

  const { data: admins, error: adminErr } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE')
    .is('deleted_at', null);

  if (adminErr) {
    console.error('job-stakeholders: admin query', adminErr);
    return res.status(500).json({ error: adminErr.message });
  }

  const adminIds = (admins || []).map((u) => u.id).filter(Boolean);
  const recipients = [...new Set([...assignees, ...adminIds])];

  if (!recipients.length) {
    return res.status(200).json({ inserted: 0, skipped: true, reason: 'no recipients' });
  }

  let rows;
  if (normalizedKind === 'updated') {
    rows = buildRowsUpdated({
      recipients,
      jobId,
      jobNumber,
      jobTitle,
      updateSummary,
    });
  } else {
    rows = buildRowsNewOrReassign({
      recipients,
      assigneeSet,
      jobId,
      jobNumber,
      jobTitle,
      kind: normalizedKind,
    });
  }

  const { error: insErr } = await supabase.from('notifications').insert(rows);
  if (insErr) {
    console.error('job-stakeholders: insert', insErr);
    return res.status(500).json({ error: insErr.message });
  }

  invalidateListCache(notificationsCachePrefix());

  return res.status(200).json({ inserted: rows.length });
}
