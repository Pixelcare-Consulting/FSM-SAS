/**
 * Build ServiceCalls PATCH body (ServiceCallActivities) per Phase 2 Postman.
 */

import { mapPortalJobStatusToSap } from './sapActivityTransform.js';
import { isJobStatusCompleted } from '../jobs/isJobStatusCompleted.js';

/**
 * True when payment_qr_inv_number is a posted invoice, not the PayNow QR
 * fallback that copies job_number.
 * @param {Object} job
 * @returns {boolean}
 */
export function hasRealSapInvoiceNumber(job) {
  const inv = String(job?.payment_qr_inv_number ?? '').trim();
  if (!inv) return false;
  const jobNumber = String(job?.job_number ?? '').trim();
  if (!jobNumber) return true;
  return inv.toUpperCase() !== jobNumber.toUpperCase();
}

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
  return hasRealSapInvoiceNumber(job) ? 'I' : 'NI';
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
  const code = String(activityCode ?? '').trim();
  const codeNum = parseInt(code, 10);
  return (Array.isArray(activities) ? activities : []).find((row) => {
    const raw = String(row?.ActivityCode ?? row?.activityCode ?? '').trim();
    if (raw === code) return true;
    const n = parseInt(raw, 10);
    return Number.isFinite(codeNum) && Number.isFinite(n) && n === codeNum;
  });
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
    ActivityCode: Number.isFinite(activityCode) ? activityCode : job.sap_activity_id,
    U_API_JobNumber: String(job.job_number || ''),
    U_API_JobStatusID: String(jobStatusId),
    U_API_JobStatus: String(jobStatusLabel).slice(0, 50),
    U_API_Tech: formatSapApiTechList(technicianJobs),
  };
  const parsedLineNum = parseInt(String(lineNum ?? ''), 10);
  if (Number.isFinite(parsedLineNum)) line.LineNum = parsedLineNum;

  // Set directly here (not via the broken SQL01 path — see
  // deriveInvoiceStatusFlag above). Only set once the job is actually
  // completed; leave untouched otherwise rather than writing an empty flag.
  const invoiceStatusFlag = deriveInvoiceStatusFlag(job, technicianJobs);
  if (invoiceStatusFlag) line.U_JobStatus = invoiceStatusFlag;

  if (poNumber) line.U_API_PONo = String(poNumber);
  if (hasRealSapInvoiceNumber(job)) {
    line.U_InvNumber = String(job.payment_qr_inv_number).trim();
  }
  if (job.sap_cm_number != null) line.U_CMNumber = job.sap_cm_number;
  if (job.sap_job_income != null && job.sap_job_income !== '') {
    const inc = Number(job.sap_job_income);
    if (Number.isFinite(inc)) line.U_JobIncome = inc;
  }

  return line;
}

/** Identity + SCL5 UDFs we send on ServiceCallActivities PATCH. */
const SERVICE_CALL_ACTIVITY_PATCH_KEYS = [
  'LineNum',
  'ActivityCode',
  'U_API_JobNumber',
  'U_API_JobStatusID',
  'U_API_JobStatus',
  'U_API_Tech',
  'U_API_PONo',
  'U_InvNumber',
  'U_JobStatus',
  'U_CMNumber',
  'U_JobIncome',
];

function activityCodeOf(row) {
  return String(row?.ActivityCode ?? row?.activityCode ?? '');
}

function lineNumOf(row) {
  const n = parseInt(String(row?.LineNum ?? row?.lineNum ?? ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Copy identity + SCL5 UDFs from an existing Service Layer activity row.
 * Omits other document fields so PATCH does not send read-only SAP properties.
 * @param {Object} row
 * @returns {Object}
 */
export function pickServiceCallActivityPatchFields(row) {
  if (!row || typeof row !== 'object') return {};
  const out = {};
  const lineNum = lineNumOf(row);
  if (lineNum !== undefined) out.LineNum = lineNum;
  const codeRaw = row.ActivityCode ?? row.activityCode;
  if (codeRaw !== undefined && codeRaw !== null && String(codeRaw) !== '') {
    const parsed = parseInt(String(codeRaw), 10);
    out.ActivityCode = Number.isFinite(parsed) ? parsed : codeRaw;
  }
  for (const key of SERVICE_CALL_ACTIVITY_PATCH_KEYS) {
    if (key === 'LineNum' || key === 'ActivityCode') continue;
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      out[key] = row[key];
    }
  }
  return out;
}

/**
 * Slim stored SCL5 line for JOB_SYNC_SAP audit `response.storedLine`.
 * @param {Object|null|undefined} row
 * @returns {Object|null}
 */
export function pickStoredServiceCallActivityLine(row) {
  if (!row || typeof row !== 'object') return null;
  const out = pickServiceCallActivityPatchFields(row);
  return Object.keys(out).length ? out : null;
}

/**
 * Merge an updated SCL5 line into the full ServiceCallActivities collection.
 * Sibling lines keep identity + UDFs so replace-on-patch does not wipe other jobs.
 * @param {Array} existingActivities
 * @param {Object} updatedLine
 * @returns {Array}
 */
export function mergeServiceCallActivityCollection(existingActivities, updatedLine) {
  const existing = Array.isArray(existingActivities) ? existingActivities : [];
  const updatedCode = activityCodeOf(updatedLine);
  let replaced = false;
  const merged = existing.map((row) => {
    if (updatedCode && activityCodeOf(row) === updatedCode) {
      replaced = true;
      return { ...pickServiceCallActivityPatchFields(row), ...updatedLine };
    }
    return pickServiceCallActivityPatchFields(row);
  });
  if (!replaced && updatedLine) {
    merged.push(updatedLine);
  }
  return merged;
}

/**
 * Live PATCH body: only the target job's SCL5 line (LineNum + ActivityCode + UDFs).
 * Do not send sibling ActivityCodes — SAP treats those as adding activities again.
 * Use mergeServiceCallActivityCollection for dry-run/preview of the full collection.
 * @param {Object} activityLine
 */
export function buildServiceCallPatchBody(activityLine) {
  return {
    ServiceCallActivities: activityLine ? [activityLine] : [],
  };
}
