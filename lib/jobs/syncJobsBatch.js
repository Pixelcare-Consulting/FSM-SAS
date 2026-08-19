/**
 * Shared batch job sync to SAP — used by UI API and cron.
 */

import { syncJobToSAP } from '../services/jobSyncToSap';
import { SYNC_CONCURRENCY } from './syncJobsQuery';

export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SYNC_CONCURRENCY,
  countJobs,
  fetchAllUnsyncedJobRows,
  fetchJobsForSapSync,
  getIncludeSyncedDateRangeError,
  getSyncPreview,
  hasDateRange,
  parseDateFilter,
  parseIncludeSynced,
  resolveBatchLimit,
} from './syncJobsQuery';

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
