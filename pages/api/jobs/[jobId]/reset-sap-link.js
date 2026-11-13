import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import sapService from '../../../../lib/services/sapService';
import {
  planJobSapLinkReset,
  applyJobSapLinkReset,
  SAP_LINK_RESET_ERROR,
  SAP_LINK_RESET_OUTCOME,
} from '../../../../lib/services/jobSapLinkReset';
import {
  writeAuditLogFromRequest,
  buildChanges,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  AUDIT_SOURCE,
} from '../../../../lib/services/auditLog';

const MODES = { PREVIEW: 'PREVIEW', APPLY: 'APPLY' };

const ERROR_STATUS = {
  [SAP_LINK_RESET_ERROR.JOB_NOT_FOUND]: 404,
  [SAP_LINK_RESET_ERROR.NOT_LINKED]: 409,
  [SAP_LINK_RESET_ERROR.INVALID_ACTIVITY_ID]: 409,
  [SAP_LINK_RESET_ERROR.ACTIVITY_EXISTS]: 409,
  [SAP_LINK_RESET_ERROR.MULTIPLE_ACTIVITIES]: 409,
  [SAP_LINK_RESET_ERROR.ACTIVITY_HELD_BY_OTHER_JOB]: 409,
  [SAP_LINK_RESET_ERROR.LINK_CHANGED]: 409,
  [SAP_LINK_RESET_ERROR.SAP_CHECK_FAILED]: 502,
  [SAP_LINK_RESET_ERROR.DB_ERROR]: 500,
};

/**
 * POST /api/jobs/[jobId]/reset-sap-link
 * Body: { mode: 'PREVIEW' | 'APPLY' }
 * PREVIEW reads SAP and reports what a reset would do. APPLY re-checks SAP and
 * clears (or repairs) jobs.sap_activity_id when the linked Activity no longer exists.
 * The user then syncs the job as usual.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { jobId } = req.query;
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ success: false, error: 'jobId is required' });
  }

  const mode = req.body && typeof req.body === 'object' ? req.body.mode : null;
  if (!Object.values(MODES).includes(mode)) {
    return res.status(400).json({ success: false, error: 'mode must be PREVIEW or APPLY' });
  }

  const sessionCookies = sapService.getSessionCookies(req);
  if (!sessionCookies) {
    return res.status(401).json({
      success: false,
      error: 'SAP session required. Please log in to SAP Business One and try again.',
    });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.warn('[reset-sap-link]', e?.message);
    return res.status(503).json({ success: false, error: 'Server misconfigured' });
  }

  const params = { supabase, sap: sapService, sessionCookies, jobId };
  const result = mode === MODES.APPLY ? await applyJobSapLinkReset(params) : await planJobSapLinkReset(params);

  if (mode === MODES.APPLY) {
    await auditApply(req, jobId, result);
  }

  if (!result.ok) {
    return res.status(ERROR_STATUS[result.code] ?? 500).json({ success: false, code: result.code, error: result.message });
  }
  return res.status(200).json({ success: true, mode, plan: result.plan });
}

/** Records the old values so a reset can be traced and reversed before the next sync. */
function auditApply(req, jobId, result) {
  const plan = result.plan;
  const description = !result.ok
    ? `SAP link reset refused: ${result.message}`
    : plan.outcome === SAP_LINK_RESET_OUTCOME.RELINK
      ? `SAP link repaired: activity ${plan.previous.sap_activity_id} was missing, re-linked to ${plan.nextActivityId}`
      : `SAP link cleared: activity ${plan.previous.sap_activity_id} no longer exists in SAP`;

  return writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.JOB_SAP_LINK_RESET,
    category: AUDIT_CATEGORIES.SAP,
    source: AUDIT_SOURCE.PORTAL,
    entityType: 'job',
    entityId: jobId,
    entityLabel: plan?.jobNumber ?? jobId,
    description,
    status: result.ok ? AUDIT_STATUS.SUCCESS : AUDIT_STATUS.FAILURE,
    details: result.ok
      ? {
          outcome: plan.outcome,
          previous_sap_activity_id: plan.previous.sap_activity_id,
          previous_last_synced_at: plan.previous.last_synced_at,
          new_sap_activity_id: plan.nextActivityId,
          service_call_number: plan.serviceCallNumber,
        }
      : { code: result.code, error: result.message },
    changes: result.ok
      ? buildChanges(plan.previous, { sap_activity_id: plan.nextActivityId, last_synced_at: null })
      : null,
  });
}
