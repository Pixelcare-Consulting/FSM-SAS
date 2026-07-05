/**
 * Transform Portal job + customer to SAP Activity (Job) payload
 * Used for POST /b1s/v1/Activities (create) and PATCH (update).
 * Ref: Phase 2 Postman Create Job / Patch Job body.
 */
import { resolvePortalJobStatusToSap } from './sapJobStatusResolver.js';

/**
 * Map portal jobs.status (SAP numeric id or legacy enum) to SAP Activity UDFs.
 * @param {string|null|undefined} portalStatus
 * @param {Array<{ U_JobStatusID: string, U_JobStatus: string }>} sapJobStatuses
 * @returns {{ jobStatusId: string, jobStatusLabel: string }}
 */
export function mapPortalJobStatusToSap(portalStatus, sapJobStatuses) {
  return resolvePortalJobStatusToSap(portalStatus, sapJobStatuses);
}

/**
 * Strip HTML tags from a string (e.g. from rich text editor) so SAP receives plain text.
 * @param {string} html - Possibly HTML string
 * @returns {string} Plain text, no <tags>
 */
function stripHtmlTags(html) {
  if (html == null || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Map portal priority to SAP Activity Priority
 * @param {string} priority - Portal: LOW | MEDIUM | HIGH | URGENT
 * @returns {string} SAP: pr_Low | pr_Normal | pr_High
 */
export function mapPriorityToSAP(priority) {
  if (!priority) return 'pr_Normal';
  const p = String(priority).toUpperCase();
  if (p === 'LOW') return 'pr_Low';
  if (p === 'MEDIUM') return 'pr_Normal';
  if (p === 'HIGH' || p === 'URGENT') return 'pr_High';
  return 'pr_Normal';
}

/**
 * Format ISO date for SAP StartDate/EndDueDate (date part only, or full ISO)
 * SAP often expects date like "2024-06-12" or "2024-06-12T00:00:00Z"
 * @param {string|null} isoDate - ISO string or null
 * @returns {string|null} YYYY-MM-DD or null
 */
function toSAPDate(isoDate) {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Format time for SAP StartTime/EndTime (HH:mm:ss)
 * @param {string|null} isoDate - ISO string or null
 * @returns {string|null} "HH:mm:ss" or null
 */
function toSAPTime(isoDate) {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const s = d.getUTCSeconds();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/**
 * OCLG.Recontact driver for SAP Job Incentives: prefer earliest job_schedule.jsdate (PDF mapping).
 * @param {Object} job - Portal job
 * @param {Array<{ jsdate?: string }>} jobScheduleRows - job_schedule rows from Supabase
 * @returns {string|null} YYYY-MM-DD for Service Layer Activity.Recontact (OCLG)
 */
export function pickJobIncentiveRecontactDate(job, jobScheduleRows = []) {
  const dates = (jobScheduleRows || [])
    .map((r) => r?.jsdate)
    .filter(Boolean)
    .map((d) => {
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
      return toSAPDate(d);
    })
    .filter(Boolean)
    .sort();
  if (dates.length) return dates[0];
  return toSAPDate(job?.scheduled_start);
}

/**
 * Resolve SAP CardCode for Activities — prefer sap_card_code over portal CP code.
 * @param {Object} customer
 * @returns {string|null}
 */
export function resolveEffectiveSapCardCode(customer) {
  return customer?.sap_card_code || customer?.customer_code || null;
}

/**
 * Build full SAP Activity payload for POST (create)
 * @param {Object} job - Portal job: job_number, title, description, priority, status, scheduled_start, scheduled_end
 * @param {Object} customer - Portal customer: sap_card_code or customer_code (CardCode)
 * @param {Object} options - { activityType, jobStatusId, jobStatusLabel, jobScheduleRows }
 * @returns {Object} SAP Activities POST body
 */
export function buildSAPActivityPayload(job, customer, options = {}) {
  const activityType = options.activityType ?? -1;
  const resolved =
    options.jobStatusId != null && options.jobStatusLabel != null
      ? {
          jobStatusId: String(options.jobStatusId),
          jobStatusLabel: String(options.jobStatusLabel),
        }
      : mapPortalJobStatusToSap(job.status, options.sapJobStatuses);
  const jobStatusId = resolved.jobStatusId;
  const jobStatusLabel = resolved.jobStatusLabel;

  const startDate = toSAPDate(job.scheduled_start);
  const startTime = toSAPTime(job.scheduled_start);
  const endDate = toSAPDate(job.scheduled_end);
  const endTime = toSAPTime(job.scheduled_end);

  const payload = {
    U_API_JobNumber: job.job_number ?? null,
    CardCode: resolveEffectiveSapCardCode(customer),
    ActivityType: activityType,
    U_API_JobCatID: options.jobCatID ?? null,
    Details: stripHtmlTags(job.title || '').substring(0, 254) || null,
    Notes: stripHtmlTags(job.description || '').substring(0, 254) || null,
    U_API_JobStatusID: String(jobStatusId),
    U_API_JobStatus: String(jobStatusLabel).substring(0, 50),
    StartDate: startDate ? `${startDate}T00:00:00Z` : null,
    StartTime: startTime || null,
    EndDueDate: endDate ? `${endDate}T00:00:00Z` : null,
    EndTime: endTime || null,
    Priority: mapPriorityToSAP(job.priority),
  };

  return payload;
}

/**
 * Build partial SAP Activity payload for PATCH (update)
 * Only include fields that are typically updated in the portal.
 * @param {Object} job - Portal job (same shape as create)
 * @param {Object} customer - Portal customer (for CardCode if needed; PATCH may not require it)
 * @param {Object} options - { jobScheduleRows } reserved for post-sync incentive push
 * @returns {Object} SAP Activities PATCH body
 */
export function buildSAPActivityPatchPayload(job, customer, options = {}) {
  const startDate = toSAPDate(job.scheduled_start);
  const startTime = toSAPTime(job.scheduled_start);
  const endDate = toSAPDate(job.scheduled_end);
  const endTime = toSAPTime(job.scheduled_end);
  const resolved =
    options.jobStatusId != null && options.jobStatusLabel != null
      ? {
          jobStatusId: String(options.jobStatusId),
          jobStatusLabel: String(options.jobStatusLabel),
        }
      : mapPortalJobStatusToSap(job.status, options.sapJobStatuses);
  const jobStatusId = resolved.jobStatusId;
  const jobStatusLabel = resolved.jobStatusLabel;

  const payload = {
    U_API_JobNumber: job.job_number ?? undefined,
    CardCode: resolveEffectiveSapCardCode(customer) ?? undefined,
    U_API_JobCatID: options.jobCatID ?? undefined,
    Details: stripHtmlTags(job.title || '').substring(0, 254) || undefined,
    Notes: stripHtmlTags(job.description || '').substring(0, 254) || undefined,
    U_API_JobStatusID: jobStatusId,
    U_API_JobStatus: jobStatusLabel.substring(0, 50),
    StartDate: startDate ? `${startDate}T00:00:00Z` : undefined,
    StartTime: startTime || undefined,
    EndDueDate: endDate ? `${endDate}T00:00:00Z` : undefined,
    EndTime: endTime || undefined,
    Priority: mapPriorityToSAP(job.priority),
  };

  // Remove undefined so PATCH doesn't overwrite with null
  const cleaned = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null) cleaned[k] = v;
  }
  return cleaned;
}
