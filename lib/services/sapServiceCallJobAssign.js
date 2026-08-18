/**
 * Assign portal job (SAP Activity) to SAP Service Call via PATCH ServiceCalls.
 */

import sapService from './sapService.js';
import {
  buildServiceCallActivityLine,
  buildServiceCallPatchBody,
  findServiceCallActivityLine,
  pickStoredServiceCallActivityLine,
} from '../utils/sapServiceCallTransform.js';
import { fetchSapJobStatuses, resolvePortalJobStatusToSap } from '../utils/sapJobStatusResolver.js';

function isAlreadyLinkedActivityError(error) {
  const msg = String(error?.message || error || '');
  return /-5002/.test(msg) || /already linked to service call/i.test(msg);
}

function lineNumFromRow(row) {
  const n = parseInt(String(row?.LineNum ?? row?.lineNum ?? ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

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
    (typeof job?.sales_order === 'object' ? job.sales_order.document_number : null);

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
  let prior = findServiceCallActivityLine(activities, job.sap_activity_id);

  const sapJobStatuses = await fetchSapJobStatuses(sessionCookies);
  const resolvedStatus = resolvePortalJobStatusToSap(job?.status, sapJobStatuses);

  const buildLine = (lineNum) =>
    buildServiceCallActivityLine({
      job,
      poNumber,
      technicianJobs: job.technician_jobs,
      lineNum,
      jobStatus: resolvedStatus,
    });

  let activityLine = buildLine(lineNumFromRow(prior));
  let patchBody = buildServiceCallPatchBody(activityLine);

  try {
    await sapService.patchServiceCall(rawCall, patchBody, sessionCookies);
  } catch (err) {
    if (!isAlreadyLinkedActivityError(err)) {
      return { ok: false, error: err?.message || String(err), request: patchBody };
    }

    try {
      existing = await sapService.getServiceCall(rawCall, sessionCookies);
    } catch (getErr) {
      return { ok: false, error: err?.message || String(err), request: patchBody, retryGetError: getErr?.message || String(getErr) };
    }

    const retryActivities = existing?.ServiceCallActivities ?? existing?.serviceCallActivities ?? [];
    prior = findServiceCallActivityLine(retryActivities, job.sap_activity_id);
    activityLine = buildLine(lineNumFromRow(prior));
    patchBody = buildServiceCallPatchBody(activityLine);

    try {
      await sapService.patchServiceCall(rawCall, patchBody, sessionCookies);
    } catch (retryErr) {
      return { ok: false, error: retryErr?.message || String(retryErr), request: patchBody };
    }
  }

  const response = {
    httpStatus: 204,
    storedLine: null,
    techPersisted: false,
  };
  const requestedTech = activityLine.U_API_Tech ?? '';

  try {
    const stored = await sapService.getServiceCall(rawCall, sessionCookies);
    const storedActivities = stored?.ServiceCallActivities ?? stored?.serviceCallActivities ?? [];
    const storedRow = findServiceCallActivityLine(storedActivities, job.sap_activity_id);
    const storedLine = pickStoredServiceCallActivityLine(storedRow);
    response.storedLine = storedLine;
    const storedTech = storedLine?.U_API_Tech ?? '';
    response.techPersisted = storedTech === requestedTech;
  } catch (getErr) {
    response.getError = getErr?.message || String(getErr);
  }

  return {
    ok: true,
    serviceCallNo: rawCall,
    lineNum: activityLine.LineNum,
    merged: Boolean(prior),
    request: patchBody,
    response,
  };
}
