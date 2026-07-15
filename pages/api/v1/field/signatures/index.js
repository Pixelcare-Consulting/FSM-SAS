import { getSupabaseAdmin } from '../../../../../lib/supabase/server';
import { withFieldApi } from '../../../../../lib/api/withFieldApi';
import {
  loadOwnedAssignment,
  resolveTechnicianIdFromUser,
  upsertJobSignature,
} from '../../../../../lib/field/fieldAssignmentHelpers';

/**
 * POST /api/v1/field/signatures
 * Body: { technicianJobId, signatureImageUrl, customerName, customerFeedback?, signedAt? }
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
  const signatureImageUrl = String(req.body?.signatureImageUrl || '').trim();
  const customerName = String(req.body?.customerName || '').trim();
  const customerFeedback = req.body?.customerFeedback ?? null;
  const signedAt = req.body?.signedAt || null;

  if (!signatureImageUrl || !customerName) {
    return res.status(400).json({
      error: 'signatureImageUrl and customerName are required',
    });
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

  const result = await upsertJobSignature(supabase, {
    technicianJobId,
    signatureImageUrl,
    customerName,
    customerFeedback,
    signedAt,
  });

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({ ok: true, signature: result.signature });
});
