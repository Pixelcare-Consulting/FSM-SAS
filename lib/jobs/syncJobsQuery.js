/**
 * Job fetch/preview helpers for SAP batch sync (no SAP session import).
 */

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
/** Parallel SAP sync workers (raise carefully — SAP session rate limits). Default 2 to reduce timeouts. */
export const SYNC_CONCURRENCY = Math.min(
  Math.max(Number(process.env.SAP_JOB_SYNC_CONCURRENCY) || 2, 1),
  8
);
const UNSYNCED_FETCH_PAGE = 1000;

function normalizeDateFrom(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.includes('T') ? s : `${s}T00:00:00.000Z`;
}

function normalizeDateTo(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.includes('T') ? s : `${s}T23:59:59.999Z`;
}

export function parseDateFilter(body = {}) {
  return {
    dateFrom: normalizeDateFrom(body.dateFrom ?? body.date_from),
    dateTo: normalizeDateTo(body.dateTo ?? body.date_to),
  };
}

export function parseIncludeSynced(body = {}) {
  return body?.includeSynced === true || body?.include_synced === true;
}

export function hasDateRange(dateFilter) {
  return Boolean(dateFilter?.dateFrom || dateFilter?.dateTo);
}

/** Returns an error message when includeSynced is set without a date range; otherwise null. */
export function getIncludeSyncedDateRangeError(includeSynced, dateFilter) {
  if (!includeSynced) return null;
  if (hasDateRange(dateFilter)) return null;
  return 'A date range is required to update jobs already in SAP.';
}

function applyDateFilter(query, dateFilter) {
  if (!dateFilter) return query;
  if (dateFilter.dateFrom) query = query.gte('created_at', dateFilter.dateFrom);
  if (dateFilter.dateTo) query = query.lte('created_at', dateFilter.dateTo);
  return query;
}

export async function countJobs(supabase, { unsyncedOnly = false, syncedOnly = false, dateFilter = null } = {}) {
  let query = supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (unsyncedOnly) query = query.is('sap_activity_id', null);
  if (syncedOnly) query = query.not('sap_activity_id', 'is', null);
  query = applyDateFilter(query, dateFilter);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function buildUnsyncedPreviewMessage(unsyncedJobs, hasFilter) {
  if (unsyncedJobs === 0) {
    return hasFilter
      ? 'No unsynced jobs in the selected date range.'
      : 'All portal jobs already have a SAP Activity ID.';
  }
  return hasFilter
    ? `${unsyncedJobs.toLocaleString()} unsynced job(s) in selected range will sync.`
    : `${unsyncedJobs.toLocaleString()} job(s) will be synced to SAP.`;
}

function buildIncludeSyncedPreviewMessage(unsyncedJobs, syncedInRange, hasFilter) {
  const parts = [];
  if (unsyncedJobs > 0) {
    parts.push(
      hasFilter
        ? `${unsyncedJobs.toLocaleString()} unsynced job(s) in selected range will sync`
        : `${unsyncedJobs.toLocaleString()} unsynced job(s) will sync`
    );
  }
  if (syncedInRange > 0) {
    parts.push(
      `${syncedInRange.toLocaleString()} already-in-SAP job(s) will be updated (not invoiced status and schedule), not created twice`
    );
  }
  if (parts.length === 0) {
    return hasFilter
      ? 'No jobs in the selected date range to sync or update.'
      : 'No jobs to sync or update.';
  }
  return `${parts.join('. ')}.`;
}

export async function getSyncPreview(supabase, dateFilter = null, options = {}) {
  const includeSynced = options.includeSynced === true;
  const hasFilter = hasDateRange(dateFilter);
  const [totalJobs, unsyncedJobs, totalUnsyncedAll, syncedInRange] = await Promise.all([
    countJobs(supabase, { dateFilter }),
    countJobs(supabase, { unsyncedOnly: true, dateFilter }),
    hasFilter ? countJobs(supabase, { unsyncedOnly: true }) : Promise.resolve(null),
    countJobs(supabase, { syncedOnly: true, dateFilter }),
  ]);
  const syncedJobs = Math.max(0, totalJobs - unsyncedJobs);
  const syncedInRangeCount = syncedInRange ?? syncedJobs;
  const toProcess = unsyncedJobs + (includeSynced ? syncedInRangeCount : 0);

  const message = includeSynced
    ? buildIncludeSyncedPreviewMessage(unsyncedJobs, syncedInRangeCount, hasFilter)
    : buildUnsyncedPreviewMessage(unsyncedJobs, hasFilter);

  return {
    success: true,
    totalJobs,
    syncedJobs,
    unsyncedJobs,
    syncedInRange: syncedInRangeCount,
    toProcess,
    includeSynced,
    totalUnsyncedAll: hasFilter ? totalUnsyncedAll : unsyncedJobs,
    concurrency: SYNC_CONCURRENCY,
    dateFrom: dateFilter?.dateFrom ?? null,
    dateTo: dateFilter?.dateTo ?? null,
    hasDateFilter: hasFilter,
    message,
  };
}

export function resolveBatchLimit(body, totalUnsynced) {
  if (body?.syncAll === true) {
    return totalUnsynced;
  }
  return Math.min(Math.max(Number(body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
}

async function fetchJobRows(supabase, limit, dateFilter = null, { syncedOnly = false } = {}) {
  const rows = [];
  let offset = 0;

  while (rows.length < limit) {
    const pageSize = Math.min(UNSYNCED_FETCH_PAGE, limit - rows.length);
    let query = supabase
      .from('jobs')
      .select('id, job_number, created_at')
      .is('deleted_at', null);

    query = syncedOnly
      ? query.not('sap_activity_id', 'is', null)
      : query.is('sap_activity_id', null);

    query = applyDateFilter(query, dateFilter)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

export async function fetchAllUnsyncedJobRows(supabase, limit, dateFilter = null) {
  return fetchJobRows(supabase, limit, dateFilter, { syncedOnly: false });
}

/**
 * Unsynced jobs in range, plus already-synced jobs when includeSynced is true.
 */
export async function fetchJobsForSapSync(
  supabase,
  limit,
  dateFilter = null,
  { includeSynced = false } = {}
) {
  const unsynced = await fetchJobRows(supabase, limit, dateFilter, { syncedOnly: false });
  if (!includeSynced) return unsynced;

  const remaining = Math.max(0, limit - unsynced.length);
  if (remaining === 0) return unsynced;

  const synced = await fetchJobRows(supabase, remaining, dateFilter, { syncedOnly: true });
  return [...unsynced, ...synced];
}
