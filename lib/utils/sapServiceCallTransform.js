/**
 * Build ServiceCalls PATCH body (ServiceCallActivities) per Phase 2 Postman.
 */

import { mapPortalJobStatusToSap } from './sapActivityTransform.js';
import { isJobStatusCompleted } from '../jobs/isJobStatusCompleted.js';

/**
 * 'I' (invoiced) | 'NI' (not invoiced yet) | null (job not completed — leave field untouched).
 * This is what SAP's Invoice Automation add-on filters SCL5.U_JobStatus on.
 *
 * NOTE: this used to be set via a raw SQL UPDATE through SAP Service Layer's
 * SQLQueries('sql01')/List — confirmed live that this does NOT work: 'sql01'
 * is a fixed pre-saved SELECT query in this company DB (returns an unrelated
 * ~10k-row document listing) and silently ignores any SqlText sent to it, so
 * that update never actually ran. Setting it here, as a real field on the
 * ServiceCallActivities line, is the only path that has been confirmed to
 * actually write to SCL5.
 * @param {Object} job
 * @param {Array} technicianJobs
 * @returns {'I'|'NI'|null}
 */
export function deriveInvoiceStatusFlag(job, technicianJobs) {
  const hasCompletedAssignment = (technicianJobs || [])
    .filter((tj) => !tj.deleted_at)
    .some((tj) => String(tj.assignment_status || '').toUpperCase() === 'COMPLETED');
  const completed = isJobStatusCompleted(job?.status) || hasCompletedAssignment;
  if (!completed) return null;
  const hasInvoiceNumber = Boolean(String(job?.payment_qr_inv_number || '').trim());
  return hasInvoiceNumber ? 'I' : 'NI';
}

/**
 * Comma-separated tech names/codes (no space after comma).
 * @param {Array<{ technician?: { sap_tech_code?: string, full_name?: string } }>} technicianJobs
 */
export function formatSapApiTechList(technicianJobs) {
  const rows = (technicianJobs || []).filter((tj) => !tj.deleted_at);
  const parts = rows
    .map((tj) => {
      const t = tj.technician || {};
      return String(t.sap_tech_code || t.full_name || '').trim();
    })
    .filter(Boolean);
  return [...new Set(parts)].join(',');
}

/**
 * @param {Array<{ LineNum?: number }>} activities
 * @returns {number}
 */
export function nextServiceCallActivityLineNum(activities) {
  const rows = Array.isArray(activities) ? activities : [];
  if (!rows.length) return 0;
  let max = -1;
  for (const row of rows) {
    const n = parseInt(String(row.LineNum ?? row.lineNum ?? -1), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Find existing line for same ActivityCode.
 * @param {Array} activities
 * @param {string|number} activityCode
 */
export function findServiceCallActivityLine(activities, activityCode) {
  const code = String(activityCode);
  return (Array.isArray(activities) ? activities : []).find(
    (row) => String(row.ActivityCode ?? row.activityCode ?? '') === code
  );
}

/**
 * @param {Object} params
 * @param {Object} params.job - portal job with job_number, status, sap_activity_id
 * @param {string|null} params.poNumber - sales_order.document_number
 * @param {Array} params.technicianJobs
 * @param {number} params.lineNum
 * @param {{ jobStatusId: string, jobStatusLabel: string }|null} [params.jobStatus]
 * @param {Array<{ U_JobStatusID: string, U_JobStatus: string }>} [params.sapJobStatuses]
 */
export function buildServiceCallActivityLine({
  job,
  poNumber,
  technicianJobs,
  lineNum,
  jobStatus = null,
  sapJobStatuses = undefined,
}) {
  const resolved =
    jobStatus?.jobStatusId != null && jobStatus?.jobStatusLabel != null
      ? jobStatus
      : mapPortalJobStatusToSap(job.status, sapJobStatuses);
  const { jobStatusId, jobStatusLabel } = resolved;
  const activityCode = parseInt(String(job.sap_activity_id), 10);

  const line = {
    LineNum: lineNum,
    ActivityCode: Number.isFinite(activityCode) ? activityCode : job.sap_activity_id,
    U_API_JobNumber: String(job.job_number || ''),
    U_API_JobStatusID: String(jobStatusId),
    U_API_JobStatus: String(jobStatusLabel).slice(0, 50),
    U_API_Tech: formatSapApiTechList(technicianJobs),
  };

  // Set directly here (not via the broken SQL01 path — see
  // deriveInvoiceStatusFlag above). Only set once the job is actually
  // completed; leave untouched otherwise rather than writing an empty flag.
  const invoiceStatusFlag = deriveInvoiceStatusFlag(job, technicianJobs);
  if (invoiceStatusFlag) line.U_JobStatus = invoiceStatusFlag;

  if (poNumber) line.U_API_PONo = String(poNumber);
  if (job.payment_qr_inv_number) line.U_InvNumber = String(job.payment_qr_inv_number);
  if (job.sap_cm_number != null) line.U_CMNumber = job.sap_cm_number;
  if (job.sap_job_income != null && job.sap_job_income !== '') {
    const inc = Number(job.sap_job_income);
    if (Number.isFinite(inc)) line.U_JobIncome = inc;
  }

  return line;
}

/**
 * PATCH body wrapping one activity line.
 */
export function buildServiceCallPatchBody(activityLine) {
  return { ServiceCallActivities: [activityLine] };
}
