import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { loadEmailSettingsFromDb, mergeEmailSettings } from '../../../lib/email/loadEmailSettings';
import { dispatchTransactionalEmail } from '../../../lib/email/dispatchTransactionalEmail';
import {
  buildMergeVarsFromBundle,
  collectTechnicianEmails,
  fetchJobBundleForEmail,
  requestAppOrigin,
  resolveCustomerToEmail,
} from '../../../lib/email/jobEmailContext';

/**
 * POST /api/email/send-template
 * Body: { templateSlug, entityType, entityId, to?, force? }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { templateSlug, entityType, entityId, to: toRaw, force } = req.body || {};
  const slug = typeof templateSlug === 'string' ? templateSlug.trim() : '';
  const type = typeof entityType === 'string' ? entityType.trim() : 'job';
  const entity = typeof entityId === 'string' ? entityId.trim() : '';

  if (!slug) {
    return res.status(400).json({ error: 'templateSlug is required' });
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
    if (!to && slug === 'job_assigned') {
      const techEmails = collectTechnicianEmails(bundle);
      to = techEmails[0] || '';
    }
  }

  if (!to) {
    return res.status(400).json({ error: 'No recipient — provide to or ensure job has contact email' });
  }

  const result = await dispatchTransactionalEmail({
    supabase,
    templateSlug: slug,
    merged,
    vars,
    to,
    bundle,
    force: force === true,
  });

  if (result.reason === 'template_not_found') {
    return res.status(404).json({ error: 'Template not found' });
  }

  if (result.error && !result.skipped) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    messageId: result.messageId,
    slug: result.slug,
  });
}
