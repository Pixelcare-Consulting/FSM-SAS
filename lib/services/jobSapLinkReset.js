/**
 * Reset a job's link to a SAP Activity that no longer exists, so the next sync
 * creates a new one. Never touches SAP data: it only reads SAP to prove the old
 * Activity is gone, then clears (or repairs) jobs.sap_activity_id.
 */

import { isSapActivityMissingError } from '../utils/sapActivityMissing.js';

export const SAP_LINK_RESET_OUTCOME = {
  /** Old Activity is gone and none exists for this job: clear the link. */
  CLEAR: 'CLEAR',
  /** Old Activity is gone but SAP has another Activity for this job number: point to it. */
  RELINK: 'RELINK',
};

export const SAP_LINK_RESET_ERROR = {
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  NOT_LINKED: 'NOT_LINKED',
  INVALID_ACTIVITY_ID: 'INVALID_ACTIVITY_ID',
  ACTIVITY_EXISTS: 'ACTIVITY_EXISTS',
  MULTIPLE_ACTIVITIES: 'MULTIPLE_ACTIVITIES',
  ACTIVITY_HELD_BY_OTHER_JOB: 'ACTIVITY_HELD_BY_OTHER_JOB',
  LINK_CHANGED: 'LINK_CHANGED',
  SAP_CHECK_FAILED: 'SAP_CHECK_FAILED',
  DB_ERROR: 'DB_ERROR',
};

const JOB_SELECT = 'id, job_number, sap_activity_id, last_synced_at, service_call:service_call_id(call_number)';

function fail(code, message) {
  return { ok: false, code, message };
}

/** OData string literal: single quotes are doubled. */
function odataString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function activityExists(sap, sessionCookies, activityId) {
  try {
    await sap.makeRequest(`Activities(${activityId})?$select=ActivityCode`, {}, sessionCookies);
    return { ok: true, exists: true };
  } catch (err) {
    const message = err?.message || String(err);
    if (isSapActivityMissingError(message)) return { ok: true, exists: false };
    return { ok: false, message };
  }
}

/**
 * Work out what a reset would do, reading SAP and the portal only.
 * @param {{ supabase: object, sap: object, sessionCookies: object, jobId: string }} params
 */
export async function planJobSapLinkReset({ supabase, sap, sessionCookies, jobId }) {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(JOB_SELECT)
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle();

  if (jobError) return fail(SAP_LINK_RESET_ERROR.DB_ERROR, jobError.message);
  if (!job) return fail(SAP_LINK_RESET_ERROR.JOB_NOT_FOUND, 'Job not found.');

  const previousActivityId = job.sap_activity_id ? String(job.sap_activity_id).trim() : '';
  if (!previousActivityId) {
    return fail(SAP_LINK_RESET_ERROR.NOT_LINKED, 'This job is not linked to a SAP activity. Sync it to create one.');
  }
  if (!/^\d+$/.test(previousActivityId)) {
    return fail(SAP_LINK_RESET_ERROR.INVALID_ACTIVITY_ID, `Stored SAP activity ID "${previousActivityId}" is not a number.`);
  }

  const check = await activityExists(sap, sessionCookies, previousActivityId);
  if (!check.ok) {
    return fail(SAP_LINK_RESET_ERROR.SAP_CHECK_FAILED, `Could not check SAP activity ${previousActivityId}: ${check.message}`);
  }
  if (check.exists) {
    return fail(
      SAP_LINK_RESET_ERROR.ACTIVITY_EXISTS,
      `SAP activity ${previousActivityId} still exists, so the link is not reset. Sync the job normally.`
    );
  }

  let candidates;
  try {
    const found = await sap.getActivities(
      { filter: `U_API_JobNumber eq ${odataString(job.job_number)}`, select: 'ActivityCode', top: 5 },
      sessionCookies
    );
    candidates = (found?.value || []).map((a) => String(a.ActivityCode));
  } catch (err) {
    return fail(SAP_LINK_RESET_ERROR.SAP_CHECK_FAILED, `Could not search SAP activities for this job: ${err?.message || err}`);
  }

  if (candidates.length > 1) {
    return fail(
      SAP_LINK_RESET_ERROR.MULTIPLE_ACTIVITIES,
      `SAP has ${candidates.length} activities for job ${job.job_number} (${candidates.join(', ')}). Check them in SAP before resetting.`
    );
  }

  let outcome = SAP_LINK_RESET_OUTCOME.CLEAR;
  let nextActivityId = null;
  if (candidates.length === 1) {
    const [candidate] = candidates;
    const { data: holders, error: holderError } = await supabase
      .from('jobs')
      .select('id, job_number')
      .eq('sap_activity_id', candidate)
      .neq('id', job.id)
      .is('deleted_at', null)
      .limit(1);
    if (holderError) return fail(SAP_LINK_RESET_ERROR.DB_ERROR, holderError.message);
    if (holders?.length) {
      return fail(
        SAP_LINK_RESET_ERROR.ACTIVITY_HELD_BY_OTHER_JOB,
        `SAP activity ${candidate} has this job number but is linked to job ${holders[0].job_number} in the portal. Check both jobs before resetting.`
      );
    }
    outcome = SAP_LINK_RESET_OUTCOME.RELINK;
    nextActivityId = candidate;
  }

  return {
    ok: true,
    plan: {
      outcome,
      jobId: job.id,
      jobNumber: job.job_number,
      previous: { sap_activity_id: previousActivityId, last_synced_at: job.last_synced_at ?? null },
      nextActivityId,
      serviceCallNumber: job.service_call?.call_number ?? null,
    },
  };
}

/**
 * Re-check SAP, then update the job. The update only applies if the job still
 * holds the activity ID that was checked.
 */
export async function applyJobSapLinkReset(params) {
  const planned = await planJobSapLinkReset(params);
  if (!planned.ok) return planned;
  const { plan } = planned;

  const { data: updated, error } = await params.supabase
    .from('jobs')
    .update({ sap_activity_id: plan.nextActivityId, last_synced_at: null })
    .eq('id', plan.jobId)
    .eq('sap_activity_id', plan.previous.sap_activity_id)
    .select('id');

  if (error) return fail(SAP_LINK_RESET_ERROR.DB_ERROR, error.message);
  if (!updated?.length) {
    return fail(SAP_LINK_RESET_ERROR.LINK_CHANGED, 'The job changed while resetting. Refresh and try again.');
  }
  return { ok: true, plan };
}
