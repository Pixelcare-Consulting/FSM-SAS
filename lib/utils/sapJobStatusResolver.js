import sapService from '../services/sapService.js';
import { getSettingsOverridesByNormKey, normMatchKey } from '../jobs/buildJobStatusesList.js';
import {
  buildSapStatusIndex,
  resolveLegacyJobStatusToSap,
  resolveLegacyStatusToSapId,
} from '../jobs/resolveLegacyJobStatusToSap.js';

function normStatusLabel(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Fetch SAP job statuses from Service Layer UDT `U_API_JOB_STATUS`.
 * @param {{ b1session: string, routeid: string }} sessionCookies
 * @returns {Promise<Array<{ Code?: string, U_JobStatusID: string, U_JobStatus: string }>>}
 */
export async function fetchSapJobStatuses(sessionCookies) {
  const data = await sapService.makeRequest('U_API_JOB_STATUS', { method: 'GET' }, sessionCookies);
  const rows = data?.value;
  if (!Array.isArray(rows)) {
    throw new Error('SAP U_API_JOB_STATUS returned unexpected shape (missing value array)');
  }
  return rows
    .map((item) => ({
      Code: item?.Code,
      U_JobStatusID: item?.U_JobStatusID != null ? String(item.U_JobStatusID).trim() : '',
      U_JobStatus: String(item?.U_JobStatus || item?.Name || '').trim(),
    }))
    .filter((r) => r.U_JobStatusID !== '');
}

function buildSapLookup(sapJobStatuses) {
  const byId = new Map();
  const byNormLabel = new Map();
  for (const row of sapJobStatuses) {
    const id = String(row?.U_JobStatusID ?? '').trim();
    const label = String(row?.U_JobStatus ?? '').trim();
    if (!id) continue;
    byId.set(id, label);
    const nk = normStatusLabel(label);
    if (nk && !byNormLabel.has(nk)) byNormLabel.set(nk, { id, label });
  }
  return { byId, byNormLabel };
}

function resolvePortalJobStatusCore(portalStatus, sapJobStatuses) {
  const raw = portalStatus != null ? String(portalStatus).trim() : '';
  if (!raw) return null;

  const { byId, byNormLabel } = buildSapLookup(sapJobStatuses);

  if (/^-?\d+$/.test(raw)) {
    const label = byId.get(raw);
    if (!label) return null;
    return { jobStatusId: raw, jobStatusLabel: label };
  }

  const key = normStatusLabel(raw);
  const hit = key ? byNormLabel.get(key) : null;
  if (hit) {
    return { jobStatusId: hit.id, jobStatusLabel: hit.label };
  }

  return resolveLegacyJobStatusToSap(raw, sapJobStatuses);
}

function tryResolveViaSettings(portalStatus, sapJobStatuses, settingsTypes) {
  if (!settingsTypes || typeof settingsTypes !== 'object') return null;
  const byNormKey = getSettingsOverridesByNormKey(settingsTypes);
  const key = normMatchKey(portalStatus);
  const row = key ? byNormKey[key] : null;
  if (!row) return null;

  const rawPortal = String(portalStatus ?? '').trim();
  const candidates = [row.value, row.name]
    .map((v) => (v != null ? String(v).trim() : ''))
    .filter((v) => v && v !== rawPortal);

  for (const cand of candidates) {
    const resolved = resolvePortalJobStatusCore(cand, sapJobStatuses);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Resolve portal jobs.status to SAP {jobStatusId, jobStatusLabel} using runtime SAP list.
 *
 * @param {string|null|undefined} portalStatus
 * @param {Array<{ U_JobStatusID: string, U_JobStatus: string }>} sapJobStatuses
 * @param {{ settingsTypes?: object }} [options]
 * @returns {{ jobStatusId: string, jobStatusLabel: string }}
 */
export function resolvePortalJobStatusToSap(portalStatus, sapJobStatuses, options = {}) {
  const raw = portalStatus != null ? String(portalStatus).trim() : '';
  if (!raw) {
    throw new Error('jobs.status is empty; cannot resolve SAP job status');
  }
  if (!Array.isArray(sapJobStatuses) || sapJobStatuses.length === 0) {
    throw new Error('SAP job statuses list is empty; cannot resolve jobs.status');
  }

  const { byId, byNormLabel } = buildSapLookup(sapJobStatuses);

  if (/^-?\d+$/.test(raw)) {
    const label = byId.get(raw);
    if (!label) {
      throw new Error(`Unknown SAP jobStatusId '${raw}' (not found in U_API_JOB_STATUS)`);
    }
    return { jobStatusId: raw, jobStatusLabel: label };
  }

  const key = normStatusLabel(raw);
  const hit = key ? byNormLabel.get(key) : null;
  if (hit) {
    return { jobStatusId: hit.id, jobStatusLabel: hit.label };
  }

  const fromSettings = tryResolveViaSettings(raw, sapJobStatuses, options.settingsTypes);
  if (fromSettings) return fromSettings;

  const fromLegacy = resolveLegacyJobStatusToSap(raw, sapJobStatuses);
  if (fromLegacy) return fromLegacy;

  const sapIndex = buildSapStatusIndex(sapJobStatuses);
  const legacyAttempt = resolveLegacyStatusToSapId(raw, sapIndex);
  if (legacyAttempt.kind === 'ambiguous') {
    throw new Error(
      `Ambiguous jobs.status '${raw}' (${legacyAttempt.candidates.length} SAP matches; manual review required)`
    );
  }

  throw new Error(`Cannot resolve jobs.status '${raw}' to SAP U_API_JOB_STATUS label`);
}
