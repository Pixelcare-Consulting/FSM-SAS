import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { loadEmailSettingsFromDb, mergeEmailSettings } from '../../../lib/email/loadEmailSettings';
import { dispatchTransactionalEmail } from '../../../lib/email/dispatchTransactionalEmail';
import { triggerExists } from '../../../lib/email/templateRegistry';
import {
  buildMergeVarsFromBundle,
  collectTechnicianEmails,
  fetchJobBundleForEmail,
  requestAppOrigin,
  resolveCustomerToEmail,
} from '../../../lib/email/jobEmailContext';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../lib/services/auditLog';

/**
 * POST /api/email/dispatch-event
 * Body: { triggerId, entityType, entityId, to?, force? }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { triggerId: triggerIdRaw, entityType, entityId, to: toRaw, force } = req.body || {};
  const triggerId = typeof triggerIdRaw === 'string' ? triggerIdRaw.trim() : '';
  const type = typeof entityType === 'string' ? entityType.trim() : 'job';
  const entity = typeof entityId === 'string' ? entityId.trim() : '';

  if (!triggerId) {
    return res.status(400).json({ error: 'triggerId is required' });
  }
  if (!entity) {
    return res.status(400).json({ error: 'entityId is required' });
  }
  if (type !== 'job') {
    return res.status(400).json({ error: 'Only entityType=job is supported today' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  const exists = await triggerExists(supabase, triggerId);
  if (!exists) {
    return res.status(404).json({ error: `Unknown trigger: ${triggerId}` });
  }

  let bundle;
  try {
    bundle = await fetchJobBundleForEmail(supabase, entity);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Entity lookup failed' });
  }
  if (!bundle) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const dbValue = await loadEmailSettingsFromDb(supabase);
  const merged = mergeEmailSettings(dbValue);
  const appOrigin = requestAppOrigin(req);

  const vars = buildMergeVarsFromBundle({
    bundle,
    appOrigin,
    mergedSettings: merged,
    completedAt: new Date(),
  });

  let to = toRaw;
  if (!to) {
    to = resolveCustomerToEmail(bundle);
    if (!to && triggerId === 'job.assigned') {
      const techEmails = collectTechnicianEmails(bundle);
      to = techEmails[0] || '';
    }
  }

  if (!to) {
    return res.status(400).json({ error: 'No recipient — provide to or ensure job has contact email' });
  }

  const result = await dispatchTransactionalEmail({
    supabase,
    triggerId,
    merged,
    vars,
    to,
    bundle,
    force: force === true,
  });

  if (result.reason === 'template_not_found') {
    return res.status(404).json({
      error: `No template mapped for trigger: ${triggerId}`,
      triggerId,
      reason: result.reason,
    });
  }

  if (result.reason === 'toggle_off') {
    return res.status(400).json({
      error: `Trigger disabled: ${triggerId}`,
      triggerId,
      reason: result.reason,
      skipped: true,
    });
  }

  if (result.error && !result.skipped) {
    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.EMAIL_DISPATCH,
      category: AUDIT_CATEGORIES.EMAIL,
      entityType: 'job',
      entityId: entity,
      entityLabel: bundle?.job?.job_number || entity,
      description: `Email dispatch failed: ${result.error}`,
      details: { triggerId, to },
      status: AUDIT_STATUS.FAILURE,
    });
    return res.status(500).json({ error: result.error, triggerId });
  }

  void writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.EMAIL_DISPATCH,
    category: AUDIT_CATEGORIES.EMAIL,
    entityType: 'job',
    entityId: entity,
    entityLabel: bundle?.job?.job_number || entity,
    description: result.skipped ? `Email dispatch skipped: ${result.reason}` : 'Email dispatched',
    details: { triggerId, to, messageId: result.messageId, reason: result.reason },
    status: result.skipped ? AUDIT_STATUS.WARNING : AUDIT_STATUS.SUCCESS,
  });

  return res.status(200).json({
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    messageId: result.messageId,
    triggerId: result.triggerId || triggerId,
    slug: result.slug,
  });
}
