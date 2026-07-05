/**
 * Pure merge logic for SAP job statuses + Settings overrides.
 * Shared by client fetchJobStatuses and server loadJobStatusesForFilter.
 */

/**
 * Normalize for matching Settings rows to SAP rows when DB value differs (e.g. CONFIRMED vs 555).
 */
export function normMatchKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normLabel(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
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

/**
 * Merge SAP rows with Settings overrides (name/color) and append settings-only entries.
 *
 * @param {{ settingsTypes?: object, sapRows?: Array }} options
 * @returns {Array<{ value: string, name: string, color?: string, id?: string }>}
 */
export function buildJobStatusesList({ settingsTypes = null, sapRows = [] } = {}) {
  const settingsOverrides = getSettingsOverridesByValue(settingsTypes);
  const settingsByNormKey = getSettingsOverridesByNormKey(settingsTypes);

  const normalizedSap = (Array.isArray(sapRows) ? sapRows : [])
    .map(normalizeSapRow)
    .filter(Boolean);

  if (normalizedSap.length === 0) {
    if (settingsTypes && typeof settingsTypes === 'object' && Object.keys(settingsTypes).length > 0) {
      return Object.entries(settingsTypes)
        .map(([id, type]) => ({
          id,
          value: type?.value != null ? String(type.value).trim() : '',
          name: type?.name != null ? String(type.name).trim() : '',
          ...(type?.color != null && String(type.color).trim() !== '' ? { color: type.color } : {}),
        }))
        .filter((s) => s.value !== '');
    }
    return [];
  }

  const apiList = normalizedSap
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
        name: override?.name ?? row.name ?? '',
        ...(color != null && String(color).trim() !== '' ? { color } : {}),
      };
    })
    .filter((s) => s.value !== '');

  const apiValuesSet = new Set(apiList.map((s) => String(s.value).trim().toUpperCase()));
  const apiLabelSet = new Set(apiList.map((s) => normLabel(s.name)).filter(Boolean));

  if (settingsTypes && typeof settingsTypes === 'object') {
    for (const [id, type] of Object.entries(settingsTypes)) {
      const v = type?.value != null ? String(type.value).trim() : '';
      if (v === '') continue;
      const key = v.toUpperCase();
      if (apiValuesSet.has(key)) continue;
      const lk = normLabel(type.name || v);
      if (lk && apiLabelSet.has(lk)) continue;
      apiValuesSet.add(key);
      if (lk) apiLabelSet.add(lk);
      apiList.push({
        id,
        value: v,
        name: type.name || v,
        ...(type.color != null && String(type.color).trim() !== '' ? { color: type.color } : {}),
      });
    }
  }

  return apiList;
}
