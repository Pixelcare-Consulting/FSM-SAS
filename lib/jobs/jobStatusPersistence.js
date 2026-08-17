import { findJobStatusEntry } from '../../utils/jobStatusDefaults.js';
import { isJobStatusCompleted } from './isJobStatusCompleted.js';

const PORTAL_ONLY_STATUS_ENUMS = new Set(['CREATED', 'IN_PROGRESS']);

function portalOnlyEnumKey(val) {
  return String(val || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

// Job status: use Settings > Job Statuses only. DB expects CANCELLED (two Ls), not CANCELED.
export const toDbStatus = (val) => {
  if (!val || !String(val).trim()) return '';
  const s = String(val).trim().toUpperCase().replace(/\s+/g, '_');
  return s === 'CANCELED' ? 'CANCELLED' : s;
};

// Persist numeric U_JobStatusID as-is; match SAP labels by name; keep portal extras as enums.
export const resolveJobStatusForDb = (formStatus, jobStatusesList) => {
  const v = formStatus && String(formStatus).trim();
  if (v) {
    if (/^-?\d+$/.test(v)) return v;
    const portalKey = portalOnlyEnumKey(v);
    if (PORTAL_ONLY_STATUS_ENUMS.has(portalKey)) return portalKey;

    const fromList = findJobStatusEntry(v, jobStatusesList);
    if (fromList?.value != null && String(fromList.value).trim() !== '') {
      const listVal = String(fromList.value).trim();
      if (/^-?\d+$/.test(listVal)) return listVal;
      const listPortal = portalOnlyEnumKey(listVal);
      if (PORTAL_ONLY_STATUS_ENUMS.has(listPortal)) return listPortal;
      return listVal;
    }
    // Do not underscore-normalize unmatched SAP labels into fake enums (e.g. Job Done → JOB_DONE).
    return v;
  }
  return jobStatusesList?.[0]?.value != null ? String(jobStatusesList[0].value) : 'CREATED';
};

// Maps a resolved jobs.status value to the allowed technician_jobs.assignment_status value.
export const mapJobStatusToAssignmentStatus = (jobStatus) => {
  if (isJobStatusCompleted(jobStatus)) return 'COMPLETED';
  const s = (jobStatus || '').toUpperCase();
  if (s.includes('CANCEL')) return 'CANCELLED';
  if (s.includes('STARTED') || s.includes('IN_PROGRESS') || s.includes('INPROGRESS')) return 'STARTED';
  return 'ASSIGNED';
};
