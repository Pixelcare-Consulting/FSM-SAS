/**
 * Shared batch job sync to SAP — used by UI API and cron.
 */

import { syncJobToSAP } from '../services/jobSyncToSap';

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

export async function getSyncPreview(supabase, dateFilter = null) {
  const hasFilter = Boolean(dateFilter?.dateFrom || dateFilter?.dateTo);
  const [totalJobs, unsyncedJobs, totalUnsyncedAll] = await Promise.all([
    countJobs(supabase, { dateFilter }),
    countJobs(supabase, { unsyncedOnly: true, dateFilter }),
    hasFilter ? countJobs(supabase, { unsyncedOnly: true }) : Promise.resolve(null),
  ]);
  const syncedJobs = Math.max(0, totalJobs - unsyncedJobs);

  let message =
    unsyncedJobs === 0
      ? hasFilter
        ? 'No unsynced jobs in the selected date range.'
        : 'All portal jobs already have a SAP Activity ID.'
      : hasFilter
        ? `${unsyncedJobs.toLocaleString()} unsynced job(s) in selected range will sync.`
        : `${unsyncedJobs.toLocaleString()} job(s) will be synced to SAP.`;

  return {
    success: true,
    totalJobs,
    syncedJobs,
    unsyncedJobs,
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

export async function fetchAllUnsyncedJobRows(supabase, limit, dateFilter = null) {
  const rows = [];
  let offset = 0;

  while (rows.length < limit) {
    const pageSize = Math.min(UNSYNCED_FETCH_PAGE, limit - rows.length);
    let query = supabase
      .from('jobs')
      .select('id, job_number, created_at')
      .is('sap_activity_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    query = applyDateFilter(query, dateFilter);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

export async function runBatchSync({ supabase, sessionCookies, jobs, onAudit, onProgress, onLog }) {
  const results = { synced: 0, failed: 0, errors: [] };
  let completed = 0;
  const total = jobs.length;
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= total) break;

      const row = jobs[i];
      const jobLabel = row.job_number || row.id;

      if (onLog) {
        onLog({
          status: 'running',
          job_number: row.job_number,
          message: `Syncing ${jobLabel}…`,
        });
      }

      const result = await syncJobToSAP({ jobId: row.id, supabase, sessionCookies });
      completed++;

      if (onAudit) {
        onAudit(row, result);
      }

      if (result.success) {
        results.synced++;
        if (onLog) {
          onLog({
            status: 'success',
            job_number: row.job_number,
            message: `${jobLabel} synced`,
            sap_activity_id: result.sap_activity_id ?? null,
          });
        }
      } else {
        results.failed++;
        results.errors.push({
          jobId: row.id,
          job_number: row.job_number ?? null,
          error: result.error,
        });
        if (onLog) {
          onLog({
            status: 'error',
            job_number: row.job_number,
            message: `${jobLabel} failed: ${result.error || 'Unknown error'}`,
          });
        }
      }

      if (onProgress) {
        onProgress({
          phase: 'sync',
          current: completed,
          total,
          job_number: row.job_number ?? null,
          synced: results.synced,
          failed: results.failed,
          lastSuccess: result.success,
        });
      }
    }
  };

  const workers = Math.min(SYNC_CONCURRENCY, Math.max(total, 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return results;
}
