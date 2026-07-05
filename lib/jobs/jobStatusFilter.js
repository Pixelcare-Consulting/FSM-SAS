import { buildJobStatusesList, getSettingsOverridesByNormKey, normMatchKey } from './buildJobStatusesList.js';
import {
  findJobStatusEntry,
  getDefaultJobStatuses,
} from '../../utils/jobStatusDefaults.js';

function escapeIlike(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

function normStatusKey(x) {
  return String(x ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function mergeJobStatusLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const row of list || []) {
      if (!row) continue;
      const value = String(row.value ?? '').trim();
      const name = String(row.name ?? '').trim();
      const key = `${value}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...row, value, name });
    }
  }
  return out;
}

function isNumericStatusId(raw) {
  return /^-?\d+$/.test(String(raw ?? '').trim());
}

/**
 * Fallback when filter is a SAP numeric id not present in the merged list:
 * match settings rows by normalized name (e.g. 554 → Unconfirmed → UNCONFIRMED).
 */
function findSettingsRowByNumericFallback(raw, jobStatusesList, mergedList) {
  const primary = Array.isArray(jobStatusesList) ? jobStatusesList : [];
  const sapRow = mergedList.find(
    (row) => isNumericStatusId(row?.value) && String(row.value).trim() === String(raw).trim()
  );
  const labelKey = normMatchKey(sapRow?.name);
  if (!labelKey) return null;

  const settingsByNormKey = getSettingsOverridesByNormKey(
    Object.fromEntries(
      primary
        .filter((row) => row?.id || row?.value)
        .map((row, idx) => [row.id || `row_${idx}`, row])
    )
  );

  const override = settingsByNormKey[labelKey];
  if (!override?.value) {
    return primary.find((row) => normMatchKey(row?.name) === labelKey || normMatchKey(row?.value) === labelKey) ?? null;
  }

  return primary.find((row) => String(row.value ?? '').trim() === String(override.value).trim()) ?? {
    value: String(override.value).trim(),
    name: override.name,
  };
}

/**
 * All raw `jobs.status` values that should match a list filter value.
 * Mirrors client-side list-jobs filtering via findJobStatusEntry (SAP id vs UNCONFIRMED alias).
 */
export function getJobStatusFilterDbValues(filterStatus, jobStatusesList) {
  const raw = String(filterStatus ?? '').trim();
  if (!raw) return [];

  const primary = Array.isArray(jobStatusesList) ? jobStatusesList : [];
  const defaults = getDefaultJobStatuses();
  const mergedList = mergeJobStatusLists(primary, defaults);

  let selected = findJobStatusEntry(raw, mergedList);
  if (!selected && isNumericStatusId(raw)) {
    selected = findSettingsRowByNumericFallback(raw, primary, mergedList);
  }
  if (!selected) return [raw];

  const canonical = String(selected.value ?? '').trim();
  if (!canonical) return [raw];

  const values = new Set([raw, canonical]);
  if (selected.name) values.add(String(selected.name).trim());

  const canonicalNorm = normStatusKey(selected.name) || normStatusKey(selected.value);

  for (const row of mergedList) {
    const rowNorm = normStatusKey(row.name) || normStatusKey(row.value);
    if (canonicalNorm && rowNorm === canonicalNorm) {
      if (row.value) values.add(String(row.value).trim());
      if (row.name) values.add(String(row.name).trim());
    }
  }

  return [...values].filter(Boolean);
}

/**
 * Apply pre-resolved status values (comma-separated) to a Supabase query.
 */
export function applyJobStatusValuesFilter(query, statusValuesCsv) {
  const dbValues = String(statusValuesCsv || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (dbValues.length === 0) return query;
  if (dbValues.length === 1) return query.ilike('status', dbValues[0]);

  const orParts = dbValues.map((v) => `status.ilike.${escapeIlike(v)}`);
  return query.or(orParts.join(','));
}

/**
 * Apply status filter to a Supabase query (case-insensitive, alias-aware).
 */
export function applyJobStatusFilter(query, filterStatus, jobStatusesList) {
  const dbValues = getJobStatusFilterDbValues(filterStatus, jobStatusesList);
  if (dbValues.length === 0) return query;
  if (dbValues.length === 1) return query.ilike('status', dbValues[0]);

  const orParts = dbValues.map((v) => `status.ilike.${escapeIlike(v)}`);
  return query.or(orParts.join(','));
}

/**
 * Load Settings + SAP snapshot job statuses for server list filters (no SAP session required).
 */
export async function loadJobStatusesForFilter(supabase) {
  const defaults = getDefaultJobStatuses();
  if (!supabase) return defaults;

  try {
    const { data: settings, error } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'jobStatuses')
      .single();

    if (!error && settings?.value) {
      const settingsTypes = settings.value.types || null;
      const sapSnapshot = Array.isArray(settings.value.sapSnapshot)
        ? settings.value.sapSnapshot
        : [];

      const merged = buildJobStatusesList({ settingsTypes, sapRows: sapSnapshot });
      if (merged.length > 0) {
        return mergeJobStatusLists(merged, defaults);
      }

      if (settingsTypes) {
        const fromSettings = Object.entries(settingsTypes)
          .map(([id, type]) => ({
            id,
            value: type?.value != null ? String(type.value).trim() : '',
            name: type?.name != null ? String(type.name).trim() : '',
          }))
          .filter((s) => s.value !== '');
        if (fromSettings.length > 0) {
          return mergeJobStatusLists(fromSettings, defaults);
        }
      }
    }
  } catch (e) {
    console.warn('loadJobStatusesForFilter:', e?.message);
  }

  return defaults;
}
