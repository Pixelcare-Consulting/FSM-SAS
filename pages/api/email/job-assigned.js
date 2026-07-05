import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { loadEmailSettingsFromDb, mergeEmailSettings } from '../../../lib/email/loadEmailSettings';
import { dispatchTransactionalEmail } from '../../../lib/email/dispatchTransactionalEmail';
import {
  buildMergeVarsFromBundle,
  fetchJobBundleForEmail,
  requestAppOrigin,
} from '../../../lib/email/jobEmailContext';
import { writeJobEmailAudit } from '../../../lib/services/auditLog';

/**
 * POST /api/email/job-assigned
 * Body: { jobId: string, technicianIds: string[] }
 * Sends one jobAssigned email per technician (must exist on technician_jobs for jobId).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { jobId, technicianIds: rawIds } = req.body || {};
  const technicianIds = Array.isArray(rawIds)
    ? [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];

  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'jobId is required' });
  }
  if (!technicianIds.length) {
    return res.status(400).json({ error: 'technicianIds is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.warn('[job-assigned]', e?.message);
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  const { data: tjRows, error: tjErr } = await supabase
    .from('technician_jobs')
    .select('technician_id')
    .eq('job_id', jobId)
    .in('technician_id', technicianIds)
    .is('deleted_at', null);

  if (tjErr) {
    console.error('[job-assigned] technician_jobs', tjErr);
    return res.status(500).json({ error: tjErr.message });
  }

  const allowed = new Set((tjRows || []).map((r) => r.technician_id).filter(Boolean));
  const verified = technicianIds.filter((id) => allowed.has(id));
  if (!verified.length) {
    return res.status(400).json({ error: 'No matching technician assignment for this job' });
  }

  let bundle;
  try {
    bundle = await fetchJobBundleForEmail(supabase, jobId);
  } catch (e) {
    console.error('[job-assigned] bundle', e);
    return res.status(500).json({ error: e?.message || 'Job lookup failed' });
  }
  if (!bundle) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const dbValue = await loadEmailSettingsFromDb(supabase);
  const merged = mergeEmailSettings(dbValue);
  const appOrigin = requestAppOrigin(req);

  /** @type {{ technicianId: string, ok: boolean, skipped?: string, error?: string, messageId?: string }[]} */
  const results = [];

  for (const technicianId of verified) {
    const techRow = bundle.technicians.find((t) => t && String(t.id) === String(technicianId));
    const to = techRow?.email != null ? String(techRow.email).trim() : '';
    if (!to) {
      results.push({ technicianId, ok: false, skipped: 'no_email' });
      continue;
    }

    const vars = buildMergeVarsFromBundle({
      bundle,
      appOrigin,
      primaryTechnicianId: technicianId,
      mergedSettings: merged,
    });

    const sendResult = await dispatchTransactionalEmail({
      supabase,
      triggerId: 'job.assigned',
      merged,
      vars,
      to,
      bundle,
    });

    results.push({
      technicianId,
      ok: sendResult.ok,
      skipped: sendResult.skipped ? sendResult.reason : undefined,
      error: sendResult.error,
      messageId: sendResult.messageId,
    });

    void writeJobEmailAudit({
      req,
      supabase,
      jobId,
      jobNumber: bundle?.job?.job_number,
      templateKey: 'jobAssigned',
      to,
      result: sendResult,
    });
  }

  return res.status(200).json({ ok: true, results });
}
