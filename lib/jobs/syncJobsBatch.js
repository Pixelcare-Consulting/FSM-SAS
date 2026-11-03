/**
 * Shared batch job sync to SAP — used by UI API and cron.
 */

import { syncJobToSAP } from '../services/jobSyncToSap.js';
import { fetchSapJobStatuses } from '../utils/sapJobStatusResolver.js';
import { SYNC_CONCURRENCY } from './syncJobsQuery.js';

export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SYNC_CONCURRENCY,
  countJobs,
  fetchAllUnsyncedJobRows,
  fetchJobsForPicker,
  fetchJobRowsByIds,
  fetchJobsForSapSync,
  getIncludeSyncedDateRangeError,
  getSyncPreview,
  hasDateRange,
  parseDateFilter,
  parseExcludedUnsyncedJobIds,
  parseIncludeSynced,
  parseJobIds,
  parsePickerRequest,
  parseSyncedJobIds,
  MAX_SYNC_CHUNK_SIZE,
  PICKER_LISTS,
  resolveBatchLimit,
} from './syncJobsQuery.js';

/**
 * @param {Object} params
 * @param {number} [params.startBy] - epoch ms; workers start no job after it. Jobs not
 *   started are returned in `unprocessedIds` so the caller can send them again.
 */
export async function runBatchSync({ supabase, sessionCookies, jobs, onAudit, onProgress, onLog, startBy = null }) {
  const results = { synced: 0, failed: 0, errors: [], unprocessedIds: [] };
  let completed = 0;
  const total = jobs.length;
  if (total === 0) return results;

  // One status lookup per batch instead of two per job; the read-backs are
  // audit-only, so bulk runs skip them to stay inside the function time limit.
  const sapJobStatuses = await fetchSapJobStatuses(sessionCookies);
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      if (nextIndex >= total) break;
      if (startBy != null && Date.now() >= startBy) break;
      const i = nextIndex++;

      const row = jobs[i];
      const jobLabel = row.job_number || row.id;

      if (onLog) {
        onLog({
          status: 'running',
          job_id: row.id,
          job_number: row.job_number,
          message: `Syncing ${jobLabel}…`,
        });
      }

      // A throw here would reject Promise.all while the other worker keeps
      // syncing, so the caller would report the batch finished when it isn't.
      const result = await syncJobToSAP({
        jobId: row.id,
        supabase,
        sessionCookies,
        sapJobStatuses,
        verifyWrites: false,
      }).catch((err) => ({ success: false, error: err?.message || String(err), job_number: row.job_number ?? null }));
      completed++;

      if (onAudit) {
        onAudit(row, result);
      }

      if (result.success) {
        results.synced++;
        if (onLog) {
          onLog({
            status: 'success',
            job_id: row.id,
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
            job_id: row.id,
            job_number: row.job_number,
            error: result.error || 'Unknown error',
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

  results.unprocessedIds = jobs.slice(nextIndex).map((row) => row.id);
  return results;
}
