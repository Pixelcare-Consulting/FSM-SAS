/**
 * Phase 2: Sync a single job to SAP Activities (create or update).
 * Used by: Create Job flow, Edit Job flow, create-job from lead, and hourly sync.
 */

import sapService from './sapService';
import { buildSAPActivityPayload, buildSAPActivityPatchPayload } from '../utils/sapActivityTransform';
import { pushJobIncentiveSapData } from './sapJobIncentivePush';
import { assignJobToServiceCall } from './sapServiceCallJobAssign';
import { fetchSapJobStatuses, resolvePortalJobStatusToSap } from '../utils/sapJobStatusResolver.js';

function isLegacyStringStatus(status) {
  const raw = String(status ?? '').trim();
  return raw !== '' && !/^-?\d+$/.test(raw);
}

async function persistResolvedStatusIfLegacy({ supabase, jobId, jobStatus, resolvedStatus }) {
  if (!isLegacyStringStatus(jobStatus) || !resolvedStatus?.jobStatusId) return;
  await supabase
    .from('jobs')
    .update({ status: resolvedStatus.jobStatusId })
    .eq('id', jobId);
}

/**
 * Extract SAP Activity ID from POST/PATCH response (ActivityCode or similar)
 * @param {Object} sapResponse - Response from createActivity or updateActivity
 * @returns {string|null} ID to store in jobs.sap_activity_id
 */
function getSAPActivityIdFromResponse(sapResponse) {
  if (!sapResponse || typeof sapResponse !== 'object') return null;
  const id = sapResponse.ActivityCode ?? sapResponse.activityCode ?? sapResponse.ID ?? sapResponse.Id;
  if (id !== undefined && id !== null) return String(id);
  return null;
}

/**
 * After Activity create/update: U_API_JOB_SCHEDULE, SCL5, ServiceCalls PATCH.
 */
async function runPostActivitySapPush({ sessionCookies, job, jobScheduleRows, supabase, jobId }) {
  const enrichedJob = { ...job };

  const incentiveResult = await pushJobIncentiveSapData({
    sessionCookies,
    job: enrichedJob,
    jobScheduleRows,
  }).catch((pushErr) => {
    console.warn('SAP job incentive push:', pushErr?.message || pushErr);
    return { schedule: { ok: false, error: pushErr?.message } };
  });

  const serviceCallResult = await assignJobToServiceCall({
    sessionCookies,
    job: enrichedJob,
  }).catch((scErr) => {
    console.warn('SAP ServiceCalls assign:', scErr?.message || scErr);
    return { ok: false, error: scErr?.message };
  });

  if (serviceCallResult && !serviceCallResult.skipped && supabase && jobId) {
    await supabase.from('job_sync_logs').insert({
      job_id: jobId,
      direction: 'to_sap',
      action: 'service_call_assign',
      sap_activity_id: enrichedJob.sap_activity_id,
      status: serviceCallResult.ok ? 'success' : 'failure',
      request_payload: serviceCallResult.request ?? null,
      response_payload: serviceCallResult.response ?? serviceCallResult,
      error_message: serviceCallResult.ok ? null : serviceCallResult.error || serviceCallResult.reason,
    });
  }

  return { incentiveResult, serviceCallResult };
}

/**
 * Sync job to SAP: create new Activity or update existing.
 * @param {Object} params
 * @param {string} params.jobId - Portal job UUID
 * @param {Object} params.supabase - Supabase client (admin or with RLS)
 * @param {Object} params.sessionCookies - SAP session from sapService.getSessionCookies(req)
 * @returns {Promise<{ success: boolean, sap_activity_id?: string, error?: string, serviceCall?: Object }>}
 */
export async function syncJobToSAP({ jobId, supabase, sessionCookies }) {
  if (!jobId || !supabase || !sessionCookies) {
    return { success: false, error: 'Missing jobId, supabase client, or SAP session' };
  }

  let sapJobStatuses;
  try {
    sapJobStatuses = await fetchSapJobStatuses(sessionCookies);
  } catch (e) {
    return { success: false, error: e?.message || 'Failed to fetch SAP job statuses' };
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(`
      id,
      job_number,
      title,
      description,
      priority,
      status,
      scheduled_start,
      scheduled_end,
      customer_id,
      sap_activity_id,
      payment_qr_inv_number,
      sap_cm_number,
      sap_cm_status,
      sap_job_income,
      service_call:service_call_id(call_number),
      sales_order:sales_order_id(document_number),
      technician_jobs(
        assignment_status,
        deleted_at,
        technician:technician_id(id, sap_tech_code, full_name)
      )
    `)
    .eq('id', jobId)
    .is('deleted_at', null)
    .single();

  if (jobError || !job) {
    return { success: false, error: jobError?.message || 'Job not found', job_number: null };
  }

  const { data: scheduleRows, error: scheduleError } = await supabase
    .from('job_schedule')
    .select('jsdate, jedate, jstime, jetime, dur_type, dur, address')
    .eq('job_id', jobId);

  if (scheduleError) {
    console.warn(`job_schedule lookup for job ${jobId}:`, scheduleError.message);
  }

  const { data: customer, error: custError } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name, sap_card_code')
    .eq('id', job.customer_id)
    .is('deleted_at', null)
    .single();

  if (custError || !customer) {
    return {
      success: false,
      error: custError?.message || 'Customer not found',
      job_number: job.job_number ?? null,
    };
  }

  const { data: jobCategoryRow, error: jobCategoryError } = await supabase
    .from('job_category')
    .select('description')
    .eq('job_id', jobId)
    .maybeSingle();

  if (jobCategoryError && jobCategoryError.code !== 'PGRST116') {
    console.warn(`job_category lookup for job ${jobId}:`, jobCategoryError.message);
  }

  let resolvedStatus;
  try {
    resolvedStatus = resolvePortalJobStatusToSap(job?.status, sapJobStatuses);
  } catch (e) {
    return { success: false, error: e?.message || 'Failed to resolve job status', job_number: job.job_number ?? null };
  }

  const scheduleOpts = {
    jobScheduleRows: Array.isArray(scheduleRows) ? scheduleRows : [],
    jobStatusId: resolvedStatus.jobStatusId,
    jobStatusLabel: resolvedStatus.jobStatusLabel,
    jobCatID: jobCategoryRow?.description != null ? String(jobCategoryRow.description).trim() : null,
  };
  const payload = buildSAPActivityPayload(job, customer, scheduleOpts);
  const now = new Date().toISOString();

  try {
    if (job.sap_activity_id) {
      const updated = await sapService.updateActivity(
        job.sap_activity_id,
        buildSAPActivityPatchPayload(job, customer, scheduleOpts),
        sessionCookies
      );
      const activityId = getSAPActivityIdFromResponse(updated) || job.sap_activity_id;

      await supabase
        .from('jobs')
        .update({ sap_activity_id: activityId, last_synced_at: now })
        .eq('id', jobId);

      await persistResolvedStatusIfLegacy({
        supabase,
        jobId,
        jobStatus: job.status,
        resolvedStatus,
      });

      await supabase.from('job_sync_logs').insert({
        job_id: jobId,
        direction: 'to_sap',
        action: 'update',
        sap_activity_id: activityId,
        status: 'success',
        request_payload: payload,
        response_payload: updated,
      });

      const jobWithActivity = { ...job, sap_activity_id: activityId };
      const { incentiveResult, serviceCallResult } = await runPostActivitySapPush({
        sessionCookies,
        job: jobWithActivity,
        jobScheduleRows: scheduleOpts.jobScheduleRows,
        supabase,
        jobId,
      });

      return {
        success: true,
        sap_activity_id: activityId,
        incentiveResult,
        serviceCall: serviceCallResult,
        job_number: job.job_number ?? null,
        syncAction: 'update',
        serviceCallNo: serviceCallResult?.serviceCallNo ?? null,
        serviceCallMerged: serviceCallResult?.merged === true,
      };
    }

    const created = await sapService.createActivity(payload, sessionCookies);
    const activityId = getSAPActivityIdFromResponse(created);

    if (activityId) {
      await supabase
        .from('jobs')
        .update({ sap_activity_id: activityId, last_synced_at: now })
        .eq('id', jobId);

      await persistResolvedStatusIfLegacy({
        supabase,
        jobId,
        jobStatus: job.status,
        resolvedStatus,
      });
    }

    await supabase.from('job_sync_logs').insert({
      job_id: jobId,
      direction: 'to_sap',
      action: 'create',
      sap_activity_id: activityId,
      status: activityId ? 'success' : 'failure',
      request_payload: payload,
      response_payload: created,
      error_message: activityId ? null : 'No ActivityCode in SAP response',
    });

    if (!activityId) {
      return {
        success: false,
        error: 'SAP did not return ActivityCode',
        job_number: job.job_number ?? null,
        syncAction: 'create',
      };
    }

    const jobWithActivity = { ...job, sap_activity_id: activityId };
    const { incentiveResult, serviceCallResult } = await runPostActivitySapPush({
      sessionCookies,
      job: jobWithActivity,
      jobScheduleRows: scheduleOpts.jobScheduleRows,
      supabase,
      jobId,
    });

    return {
      success: true,
      sap_activity_id: activityId,
      incentiveResult,
      serviceCall: serviceCallResult,
      job_number: job.job_number ?? null,
      syncAction: 'create',
      serviceCallNo: serviceCallResult?.serviceCallNo ?? null,
      serviceCallMerged: serviceCallResult?.merged === true,
    };
  } catch (err) {
    const errorMessage = err?.message || String(err);
    await supabase.from('job_sync_logs').insert({
      job_id: jobId,
      direction: 'to_sap',
      action: job.sap_activity_id ? 'update' : 'create',
      sap_activity_id: job.sap_activity_id,
      status: 'failure',
      request_payload: payload,
      error_message: errorMessage,
    });
    return {
      success: false,
      error: errorMessage,
      job_number: job.job_number ?? null,
      syncAction: job.sap_activity_id ? 'update' : 'create',
    };
  }
}
