/**
 * Single source of truth: whether jobs.status represents a completed job.
 * Used by email notifications, Edit Job assignment sync, and jobService.update.
 */

/** SAP U_JobStatusID values that mean work is finished. */
const SAP_COMPLETED_STATUS_IDS = new Set(['-1', '572', '611']);

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function isJobStatusCompleted(status) {
  if (status == null) return false;
  const raw = String(status).trim();
  if (!raw) return false;

  if (SAP_COMPLETED_STATUS_IDS.has(raw)) return true;

  const s = raw.toUpperCase().replace(/\s+/g, '_');
  if (!s) return false;
  if (s.includes('INCOMPLETE') || s.includes('NOT_COMPLET')) return false;
  if (SAP_COMPLETED_STATUS_IDS.has(s)) return true;
  if (s.includes('JOB_DONE')) return true;
  return s.includes('COMPLET') || s === 'COMPLETE' || s === 'JOB_COMPLETE';
}
