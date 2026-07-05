/**
 * POST /api/notifications/follow-up-stakeholders
 * Notify job assignees (users linked to technician_jobs) and all active ADMIN users when a follow-up is created.
 * Optionally sends follow-up template email: To = job creator + follow-up creator; CC = assigned technicians.
 */
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { notificationsCachePrefix } from '../../../lib/notifications/notificationSummary';
import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';
import { loadEmailSettingsFromDb, mergeEmailSettings } from '../../../lib/email/loadEmailSettings';
import { dispatchTransactionalEmail } from '../../../lib/email/dispatchTransactionalEmail';
import {
  buildMergeVarsFromBundle,
  fetchJobBundleForEmail,
  requestAppOrigin,
  resolveUserDeliverableEmail,
  resolveUserDisplayName,
} from '../../../lib/email/jobEmailContext';

async function fetchActiveAdminIds(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE')
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map((u) => u.id).filter(Boolean);
}

async function fetchJobAssigneeUserIds(supabase, jobId) {
  const { data: tj, error } = await supabase
    .from('technician_jobs')
    .select('technician_id')
    .eq('job_id', jobId)
    .is('deleted_at', null);
  if (error) throw error;
  const techIds = [...new Set((tj || []).map((r) => r.technician_id).filter(Boolean))];
  if (!techIds.length) return [];
  const { data: techs, error: tErr } = await supabase
    .from('technicians')
    .select('user_id')
    .in('id', techIds)
    .is('deleted_at', null);
  if (tErr) throw tErr;
  return [...new Set((techs || []).map((t) => t.user_id).filter(Boolean))];
}

async function technicianUserId(supabase, technicianId) {
  if (!technicianId) return null;
  const { data, error } = await supabase
    .from('technicians')
    .select('user_id')
    .eq('id', technicianId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return null;
  return data?.user_id || null;
}

function notesSnippet(notes, max = 100) {
  const s = (notes || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function formatDueDateForEmail(dueDateRaw) {
  if (dueDateRaw == null || dueDateRaw === '') return '';
  try {
    const d = new Date(dueDateRaw);
    if (Number.isNaN(d.getTime())) return String(dueDateRaw);
    return d.toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(dueDateRaw);
  }
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
    console.warn('follow-up-stakeholders: Supabase admin not configured', e?.message);
    return res.status(503).json({ error: 'Notifications service unavailable' });
  }

  const {
    jobId,
    jobNumber,
    jobTitle,
    followUpType,
    notes,
    followUpTechnicianId,
    /** public.users.id — person who created the follow-up; always notify them (not always assignee/admin). */
    createdByUserId,
    dueDate,
  } = req.body || {};

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  try {
    const [adminIds, assigneeUserIds] = await Promise.all([
      fetchActiveAdminIds(supabase),
      fetchJobAssigneeUserIds(supabase, jobId),
    ]);

    const extraFromFollowUp = await technicianUserId(supabase, followUpTechnicianId);
    const stakeHolders = [...assigneeUserIds];
    if (extraFromFollowUp) stakeHolders.push(extraFromFollowUp);
    if (createdByUserId) stakeHolders.push(createdByUserId);

    const recipients = [...new Set([...stakeHolders, ...adminIds])];

    const label = jobNumber || String(jobId).slice(0, 8);
    const title = 'New follow-up';
    const typeLabel = (followUpType || 'Follow-up').toString().trim();
    const snippet = notesSnippet(notes);
    const subtitle = (jobTitle || '').trim() || 'Open the job for details';
    const message = snippet
      ? `${label} — ${typeLabel}: ${snippet} (${subtitle})`
      : `${label} — ${typeLabel} (${subtitle})`;

    const actionHref = `/dashboard/jobs/${jobId}`;

    let inserted = 0;
    if (recipients.length) {
      const rows = recipients.map((worker_id) => ({
        worker_id,
        title,
        message,
        type: 'follow_up_created',
        read: false,
        hidden: false,
        action_href: actionHref,
      }));

      const { error: insErr } = await supabase.from('notifications').insert(rows);
      if (insErr) {
        console.error('follow-up-stakeholders: insert', insErr);
        return res.status(500).json({ error: insErr.message });
      }
      inserted = rows.length;
      invalidateListCache(notificationsCachePrefix());
    }

    /** @type {Record<string, unknown>} */
    let emailResult = { skipped: true };
    try {
      const { data: jobRow } = await supabase
        .from('jobs')
        .select('created_by')
        .eq('id', jobId)
        .is('deleted_at', null)
        .maybeSingle();

      const creatorId = jobRow?.created_by || null;
      const toSet = new Set();
      const addTo = async (userId) => {
        const em = await resolveUserDeliverableEmail(supabase, userId);
        if (em) toSet.add(em);
      };
      await addTo(creatorId);
      await addTo(createdByUserId);
      const uniqueTo = [...toSet];

      const bundle = await fetchJobBundleForEmail(supabase, jobId);
      if (uniqueTo.length && bundle) {
        const dbValue = await loadEmailSettingsFromDb(supabase);
        const merged = mergeEmailSettings(dbValue);
        const appOrigin = requestAppOrigin(req);
        const typeLabel = (followUpType || 'Follow-up').toString().trim();
        const snippet = notesSnippet(notes, 150);
        const titleForTemplate = snippet ? `${typeLabel}: ${snippet}` : typeLabel;

        const [n1, n2] = await Promise.all([
          resolveUserDisplayName(supabase, creatorId),
          resolveUserDisplayName(supabase, createdByUserId),
        ]);
        const assigneeName =
          [n1, n2].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ') || 'Team';

        const followUpExtras = {
          follow_up_title: titleForTemplate,
          due_date: formatDueDateForEmail(dueDate),
          notes_line: notes ? `Notes: ${notesSnippet(notes, 400)}` : '',
          assignee_name: assigneeName,
        };

        const vars = buildMergeVarsFromBundle({
          bundle,
          appOrigin,
          followUp: followUpExtras,
          mergedSettings: merged,
        });

        emailResult = await dispatchTransactionalEmail({
          supabase,
          triggerId: 'follow_up.created',
          merged,
          vars,
          to: uniqueTo,
          bundle,
        });
      }
    } catch (emailErr) {
      console.warn('follow-up-stakeholders: follow-up email', emailErr?.message || emailErr);
    }

    return res.status(200).json({ inserted, email: emailResult });
  } catch (e) {
    console.error('follow-up-stakeholders', e);
    return res.status(500).json({ error: e?.message || 'Failed' });
  }
}
