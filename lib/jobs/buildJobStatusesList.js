/**
 * Pure merge logic for SAP job statuses + Settings color overlay.
 * Shared by client fetchJobStatuses and server loadJobStatusesForFilter.
 */

import { getDefaultJobStatuses } from '../../utils/jobStatusDefaults.js';

/**
 * Normalize for matching Settings rows to SAP rows when DB value differs (e.g. CONFIRMED vs 555).
 */
export function normMatchKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Build a map of status value -> { name, color } from Settings types.
 */
export function getSettingsOverridesByValue(settingsTypes) {
  const map = {};
  if (!settingsTypes || typeof settingsTypes !== 'object') return map;
  for (const type of Object.values(settingsTypes)) {
    const v = type?.value != null ? String(type.value).trim() : '';
    if (v === '') continue;
    map[v] = { name: type.name, color: type.color };
    map[v.toUpperCase()] = { name: type.name, color: type.color };
  }
  return map;
}

/**
 * Map normalized name/value keys -> settings row so SAP U_JobStatusID (555) still picks up
 * a row stored as value CONFIRMED or name "Confirmed".
 */
export function getSettingsOverridesByNormKey(settingsTypes) {
  const map = {};
  if (!settingsTypes || typeof settingsTypes !== 'object') return map;
  for (const type of Object.values(settingsTypes)) {
    const payload = { name: type?.name, color: type?.color, value: type?.value };
    for (const cand of [type?.name, type?.value]) {
      const k = normMatchKey(cand);
      if (k) map[k] = payload;
    }
  }
  return map;
}

function resolveSettingsOverride(settingsOverrides, settingsByNormKey, sapId, sapLabel) {
  const id = sapId != null ? String(sapId).trim() : '';
  let o = id ? settingsOverrides[id] || settingsOverrides[id.toUpperCase()] : null;
  if (o) return o;
  const labelKey = normMatchKey(sapLabel);
  if (labelKey && settingsByNormKey[labelKey]) return settingsByNormKey[labelKey];
  return null;
}

function normalizeSapRow(item) {
  if (!item) return null;
  const value =
    item.value != null
      ? String(item.value).trim()
      : item.U_JobStatusID != null
        ? String(item.U_JobStatusID).trim()
        : '';
  const name = String(item.name ?? item.U_JobStatus ?? item.Name ?? '').trim();
  if (!value) return null;
  return { value, name };
}

function isNumericStatusId(raw) {
  return /^-?\d+$/.test(String(raw ?? '').trim());
}

function numericSettingsFallback(settingsTypes) {
  if (!settingsTypes || typeof settingsTypes !== 'object') return [];
  return Object.entries(settingsTypes)
    .map(([id, type]) => ({
      id,
      value: type?.value != null ? String(type.value).trim() : '',
      name: type?.name != null ? String(type.name).trim() : '',
      ...(type?.color != null && String(type.color).trim() !== '' ? { color: type.color } : {}),
    }))
    .filter((s) => s.value !== '' && isNumericStatusId(s.value));
}

function applySettingsColorOnly(normalizedSap, settingsTypes) {
  const settingsOverrides = getSettingsOverridesByValue(settingsTypes);
  const settingsByNormKey = getSettingsOverridesByNormKey(settingsTypes);

  return normalizedSap
    .map((row) => {
      const override = resolveSettingsOverride(
        settingsOverrides,
        settingsByNormKey,
        row.value,
        row.name
      );
      const color = override?.color;
      return {
        value: row.value,
        name: row.name ?? '',
        ...(color != null && String(color).trim() !== '' ? { color } : {}),
      };
    })
    .filter((s) => s.value !== '');
}

/**
 * Build the job-status dropdown list.
 * When SAP rows exist: U_JobStatusID as value, SAP U_JobStatus as name; Settings color only.
 * Portal-only extras (CREATED, SCHEDULED, …) are never appended. Settings cannot rename SAP IDs.
 *
 * @param {{ settingsTypes?: object, sapRows?: Array, sapSnapshot?: Array }} options
 * @returns {Array<{ value: string, name: string, color?: string, id?: string }>}
 */
export function buildJobStatusesList({ settingsTypes = null, sapRows = [], sapSnapshot = [] } = {}) {
  const liveSap = (Array.isArray(sapRows) ? sapRows : [])
    .map(normalizeSapRow)
    .filter(Boolean);

  const snapshotSap =
    liveSap.length > 0
      ? []
      : (Array.isArray(sapSnapshot) ? sapSnapshot : []).map(normalizeSapRow).filter(Boolean);

  const normalizedSap = liveSap.length > 0 ? liveSap : snapshotSap;

  if (normalizedSap.length > 0) {
    return applySettingsColorOnly(normalizedSap, settingsTypes);
  }

  const numericFromSettings = numericSettingsFallback(settingsTypes);
  if (numericFromSettings.length > 0) {
    return numericFromSettings;
  }

  return getDefaultJobStatuses();
}
