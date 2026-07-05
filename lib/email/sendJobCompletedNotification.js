/** Server-side only — import from API routes only. */

import { loadEmailSettingsFromDb, mergeEmailSettings, EMAIL_ADDRESS_RE } from './loadEmailSettings';
import { dispatchTransactionalEmail } from './dispatchTransactionalEmail';
import {
  buildMergeVarsFromBundle,
  fetchJobBundleForEmail,
  resolveUserDeliverableEmail,
  resolveCustomerToEmail,
} from './jobEmailContext';
import { isJobStatusCompleted } from '../jobs/isJobStatusCompleted';
import { writeJobEmailAudit } from '../services/auditLog';

const TEMPLATE_KEY = 'jobCompleted';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function fetchActiveAdminEmails(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('id, username')
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE')
    .is('deleted_at', null);

  if (error) {
    console.warn('[sendJobCompletedNotification] admins', error.message);
    return [];
  }

  const out = [];
  for (const u of data || []) {
    if (!u?.id) continue;
    const resolved = await resolveUserDeliverableEmail(supabase, u.id);
    if (resolved) {
      out.push(resolved);
      continue;
    }
    const un = u.username != null ? String(u.username).trim() : '';
    if (un && EMAIL_ADDRESS_RE.test(un)) out.push(un);
  }
  return [...new Set(out)];
}

/**
 * Delete prior send log so force-resend can claim a new slot.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 */
async function clearJobEmailLogForResend(supabase, jobId) {
  try {
    await supabase
      .from('job_email_log')
      .delete()
      .eq('job_id', jobId)
      .eq('template_key', TEMPLATE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Claim a send slot in job_email_log. Returns false when already sent.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 */
async function claimJobEmailSend(supabase, jobId) {
  const { error } = await supabase.from('job_email_log').insert({
    job_id: jobId,
    template_key: TEMPLATE_KEY,
  });

  if (!error) return { claimed: true };

  if (error.code === '23505') {
    return { claimed: false, reason: 'already_sent' };
  }

  if (error.code === '42P01') {
    console.warn('[sendJobCompletedNotification] job_email_log table missing — dedupe disabled');
    return { claimed: true, noTable: true };
  }

  console.warn('[sendJobCompletedNotification] job_email_log insert', error.message);
  return { claimed: true, noTable: true };
}

/**
 * Release dedupe claim when send did not succeed (allows retry).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 */
async function releaseJobEmailClaim(supabase, jobId) {
  try {
    await supabase
      .from('job_email_log')
      .delete()
      .eq('job_id', jobId)
      .eq('template_key', TEMPLATE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Send job-completed notification email (idempotent via job_email_log).
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {string} opts.jobId
 * @param {unknown} [opts.previousStatus] — when provided and already complete, skip (client guard)
 * @param {boolean} [opts.force] — skip dedupe / already_completed guards and resend
 * @param {string} [opts.appOrigin]
 * @param {import('next').NextApiRequest} [opts.req]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string, messageId?: string }>}
 */
export async function sendJobCompletedNotification({
  supabase,
  jobId,
  previousStatus,
  force = false,
  appOrigin = '',
  req,
}) {
  const auditBase = {
    supabase,
    req,
    jobId,
    jobNumber: null,
    templateKey: TEMPLATE_KEY,
    to: '',
  };

  const finish = (result, auditOverrides = {}) => {
    writeJobEmailAudit({ ...auditBase, ...auditOverrides, result });
    return result;
  };

  if (
    !force &&
    previousStatus != null &&
    String(previousStatus).trim() !== '' &&
    isJobStatusCompleted(previousStatus)
  ) {
    return finish({ ok: true, skipped: true, reason: 'already_completed' });
  }

  if (force) {
    await clearJobEmailLogForResend(supabase, jobId);
  }

  const claim = await claimJobEmailSend(supabase, jobId);
  if (!claim.claimed) {
    return finish({ ok: true, skipped: true, reason: claim.reason || 'already_sent' });
  }

  let bundle;
  try {
    bundle = await fetchJobBundleForEmail(supabase, jobId);
  } catch (e) {
    if (!claim.noTable) await releaseJobEmailClaim(supabase, jobId);
    console.error('[sendJobCompletedNotification] bundle', e);
    return finish({ ok: false, error: e?.message || 'Job lookup failed' });
  }

  if (!bundle) {
    if (!claim.noTable) await releaseJobEmailClaim(supabase, jobId);
    return finish({ ok: false, error: 'Job not found' });
  }

  auditBase.jobNumber = bundle.job?.job_number ?? null;

  if (!isJobStatusCompleted(bundle.job.status)) {
    if (!claim.noTable) await releaseJobEmailClaim(supabase, jobId);
    return finish({ ok: true, skipped: true, reason: 'not_completed' });
  }

  const to = resolveCustomerToEmail(bundle);
  if (!to) {
    if (!claim.noTable) await releaseJobEmailClaim(supabase, jobId);
    return finish({ ok: true, skipped: true, reason: 'no_customer_email' });
  }

  auditBase.to = to;

  const dbValue = await loadEmailSettingsFromDb(supabase);
  const merged = mergeEmailSettings(dbValue);
  const completedAt = new Date();

  const vars = buildMergeVarsFromBundle({
    bundle,
    appOrigin: appOrigin || '',
    completedAt,
    mergedSettings: merged,
  });

  const sendResult = await dispatchTransactionalEmail({
    supabase,
    triggerId: 'job.completed',
    merged,
    vars,
    to,
    bundle,
    force,
  });

  if (!sendResult.ok || sendResult.skipped) {
    if (!claim.noTable) await releaseJobEmailClaim(supabase, jobId);
  }

  return finish({
    ok: sendResult.ok,
    skipped: sendResult.skipped,
    reason: sendResult.reason,
    error: sendResult.error,
    messageId: sendResult.messageId,
  });
}
