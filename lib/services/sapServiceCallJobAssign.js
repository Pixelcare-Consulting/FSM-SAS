/**
 * Assign portal job (SAP Activity) to SAP Service Call via PATCH ServiceCalls.
 */

import sapService from './sapService.js';
import {
  buildServiceCallActivityLine,
  buildServiceCallPatchBody,
  findServiceCallActivityLine,
  nextServiceCallActivityLineNum,
} from '../utils/sapServiceCallTransform.js';
import { fetchSapJobStatuses, resolvePortalJobStatusToSap } from '../utils/sapJobStatusResolver.js';

/**
 * @param {Object} params
 * @param {Object} params.sessionCookies
 * @param {Object} params.job - job with sap_activity_id, job_number, status, technician_jobs, service_call, sales_order
 */
export async function assignJobToServiceCall({ sessionCookies, job }) {
  const callNumber =
    job?.service_call?.call_number ??
    (typeof job?.service_call === 'object' && job.service_call?.call_number) ??
    null;

  const rawCall = String(callNumber ?? '').trim();
  if (!rawCall) {
    return { ok: false, skipped: true, reason: 'skipped_no_service_call' };
  }

  if (!job?.sap_activity_id) {
    return { ok: false, skipped: true, reason: 'missing_sap_activity_id' };
  }

  const poNumber =
    job?.sales_order?.document_number ??
    (typeof job?.sales_order === 'object' ? job.sales_order?.document_number : null);

  let existing;
  try {
    existing = await sapService.getServiceCall(rawCall, sessionCookies);
  } catch (err) {
    const msg = err?.message || String(err);
    if (/404|not found/i.test(msg)) {
      return { ok: false, skipped: true, reason: 'service_call_not_in_sap', error: msg };
    }
    return { ok: false, error: msg };
  }

  const activities = existing?.ServiceCallActivities ?? existing?.serviceCallActivities ?? [];
  const prior = findServiceCallActivityLine(activities, job.sap_activity_id);
  const lineNum = prior
    ? parseInt(String(prior.LineNum ?? prior.lineNum ?? 0), 10)
    : nextServiceCallActivityLineNum(activities);

  const sapJobStatuses = await fetchSapJobStatuses(sessionCookies);
  const resolvedStatus = resolvePortalJobStatusToSap(job?.status, sapJobStatuses);

  const activityLine = buildServiceCallActivityLine({
    job,
    poNumber,
    technicianJobs: job.technician_jobs,
    lineNum: Number.isFinite(lineNum) ? lineNum : 0,
    jobStatus: resolvedStatus,
  });

  const patchBody = buildServiceCallPatchBody(activityLine);

  try {
    const response = await sapService.patchServiceCall(rawCall, patchBody, sessionCookies);
    return {
      ok: true,
      serviceCallNo: rawCall,
      lineNum: activityLine.LineNum,
      merged: Boolean(prior),
      request: patchBody,
      response,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), request: patchBody };
  }
}
