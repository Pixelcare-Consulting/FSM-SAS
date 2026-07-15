import { getSupabaseAdmin } from '../../../../../lib/supabase/server';
import { withFieldApi } from '../../../../../lib/api/withFieldApi';
import {
  loadOwnedAssignment,
  resolveTechnicianIdFromUser,
  upsertJobSignature,
} from '../../../../../lib/field/fieldAssignmentHelpers';
import { runTechnicianCompleteFlow } from '../../../../../lib/jobs/runTechnicianCompleteFlow';

/**
 * POST /api/v1/field/assignments/complete
 * Body: {
 *   technicianJobId,
 *   completedAt?,
 *   signature?: { signatureImageUrl, customerName, customerFeedback?, signedAt? }
 * }
 * Sets completed_at + COMPLETED, optional signature upsert, then completion/email path.
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
  const completedAtRaw = req.body?.completedAt;
  const completedAt =
    typeof completedAtRaw === 'string' && completedAtRaw.trim()
      ? completedAtRaw.trim()
      : new Date().toISOString();
  const signaturePayload = req.body?.signature || null;

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

  let signature = null;
  if (signaturePayload) {
    const signatureImageUrl = String(signaturePayload.signatureImageUrl || '').trim();
    const customerName = String(signaturePayload.customerName || '').trim();
    if (!signatureImageUrl || !customerName) {
      return res.status(400).json({
        error: 'signature.signatureImageUrl and signature.customerName are required',
      });
    }
    const sigResult = await upsertJobSignature(supabase, {
      technicianJobId,
      signatureImageUrl,
      customerName,
      customerFeedback: signaturePayload.customerFeedback || null,
      signedAt: signaturePayload.signedAt || completedAt,
    });
    if (sigResult.error) {
      return res.status(500).json({ error: sigResult.error });
    }
    signature = sigResult.signature;
  }

  const patch = {
    assignment_status: 'COMPLETED',
    completed_at: completedAt,
    updated_at: new Date().toISOString(),
  };
  if (!assignment.started_at) {
    patch.started_at = completedAt;
  }

  const { data: updated, error: updateError } = await supabase
    .from('technician_jobs')
    .update(patch)
    .eq('id', technicianJobId)
    .select(
      'id, job_id, technician_id, assignment_status, started_at, completed_at, accumulated_hours'
    )
    .single();

  if (updateError) {
    console.error('[field/assignments/complete]', updateError.message);
    return res.status(500).json({ error: updateError.message });
  }

  const completeResult = await runTechnicianCompleteFlow({
    supabase,
    jobId: assignment.job_id,
    req,
  });

  if (completeResult.httpStatus && completeResult.httpStatus >= 400) {
    return res.status(completeResult.httpStatus).json({
      ok: false,
      assignment: updated,
      signature,
      completion: completeResult,
      error: completeResult.error,
    });
  }

  return res.status(200).json({
    ok: true,
    assignment: updated,
    signature,
    completion: completeResult,
  });
});
