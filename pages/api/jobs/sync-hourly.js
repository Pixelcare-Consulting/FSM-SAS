/**
 * Phase 2: Batch job sync to SAP.
 * POST /api/jobs/sync-hourly
 * Body:
 *   { preview: true } — counts only, no sync
 *   { stream: true, syncAll: true } — SSE live sync (all unsynced jobs)
 *   { includeSynced: true, dateFrom, dateTo } — also update jobs already in SAP (date range required)
 *   { includeSynced: true, syncedJobIds: [...] } — only update the listed already-in-SAP jobs
 *   { excludedUnsyncedJobIds: [...] } — skip these unsynced jobs (unticked in the picker)
 *   { preview: true } — also returns unsyncedJobsList (+ syncedJobsList when includeSynced) for the pickers
 *   { picker: 'synced' | 'unsynced', search, dateFrom, dateTo } — one picker list, search applied server-side
 *   { plan: true, ...same filters as a sync } — ordered { id, job_number } list the sync would process
 *   { stream: true, jobIds: [...], chunkIndex, chunkCount, dateFrom, dateTo } — SSE sync of one chunk
 *     (max MAX_SYNC_CHUNK_SIZE ids). The UI plans once, then sends chunks so no request hits the
 *     function time limit.
 *   { limit?: number } — capped batch (cron/scripts)
 *
 * Requires SAP session cookies (except preview-only without SAP — preview doesn't need SAP).
 */

import { getSupabaseAdmin } from '../../../lib/supabase/server';
import sapService from '../../../lib/services/sapService';
import {
  countJobs,
  fetchJobRowsByIds,
  fetchJobsForPicker,
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
  PICKER_LISTS,
  resolveBatchLimit,
  runBatchSync,
  SYNC_CONCURRENCY,
} from '../../../lib/jobs/syncJobsBatch';
import {
  AUDIT_STATUS,
  AUDIT_SOURCE,
  JOB_SYNC_LIFECYCLE,
  logJobSyncResult,
  writeJobSyncAuditFromRequest,
} from '../../../lib/services/auditLog';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

function logPerJobSyncAudit(req, row, result) {
  logJobSyncResult({
    req,
    jobId: row.id,
    jobNumber: result.job_number ?? row.job_number,
    result,
    source: AUDIT_SOURCE.API,
  });
}

function parseBody(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return {};
  }
}

/** Switch the response to Server-Sent Events; returns a non-throwing `send`. */
function openEventStream(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  try {
    res.socket?.setNoDelay(true);
  } catch (_) {}

  return (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };
}

function parseChunkPosition(body) {
  const index = Number.parseInt(body?.chunkIndex, 10);
  const count = Number.parseInt(body?.chunkCount, 10);
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || count < 1 || index >= count) {
    return null;
  }
  return { index, count };
}

async function logJobSyncLifecycle(req, phase, extra = {}) {
  const isStart = phase === 'started';
  await writeJobSyncAuditFromRequest(req, {
    entityType: 'job_sync',
    entityLabel: isStart ? 'Job Sync' : 'Job Sync',
    description: isStart ? JOB_SYNC_LIFECYCLE.STARTED : JOB_SYNC_LIFECYCLE.COMPLETED,
    details: {
      phase,
      ...extra,
    },
    status: extra.error ? AUDIT_STATUS.FAILURE : AUDIT_STATUS.SUCCESS,
  });
}

/** One client-planned chunk: sync exactly these jobs, then `done` with this chunk's results. */
async function streamChunkSync({ req, res, send, supabase, sessionCookies, jobIds, dateFilter, body, onAudit }) {
  const chunk = parseChunkPosition(body);
  const lifecycle = {
    stream: true,
    chunked: true,
    chunk: chunk ? `${chunk.index + 1}/${chunk.count}` : null,
    dateFrom: dateFilter?.dateFrom ?? null,
    dateTo: dateFilter?.dateTo ?? null,
    dateField: dateFilter.dateField,
  };

  try {
    const jobs = await fetchJobRowsByIds(supabase, jobIds, dateFilter);
    send({
      type: 'start',
      processing: jobs.length,
      toProcess: jobs.length,
      skipped: jobIds.length - jobs.length,
      concurrency: SYNC_CONCURRENCY,
      chunk,
      message: `Syncing ${jobs.length.toLocaleString()} job(s) to SAP (${SYNC_CONCURRENCY} parallel)…`,
    });

    await logJobSyncLifecycle(req, 'started', { ...lifecycle, processed: jobs.length, requested: jobIds.length });

    const results = await runBatchSync({
      supabase,
      sessionCookies,
      jobs,
      onAudit,
      onProgress: (p) => send({ type: 'progress', ...p }),
      onLog: (entry) => send({ type: 'log', ts: new Date().toISOString(), ...entry }),
    });

    const remainingUnsynced = await countJobs(supabase, { unsyncedOnly: true, dateFilter });

    await logJobSyncLifecycle(req, 'completed', {
      ...lifecycle,
      synced: results.synced,
      failed: results.failed,
      processed: jobs.length,
      remainingUnsynced,
    });

    send({
      type: 'done',
      success: true,
      message: `Synced ${results.synced} jobs, ${results.failed} failed`,
      processed: jobs.length,
      remainingUnsynced,
      concurrency: SYNC_CONCURRENCY,
      chunk,
      ...results,
    });
  } catch (e) {
    await logJobSyncLifecycle(req, 'completed', { ...lifecycle, error: e?.message || 'Sync failed' });
    send({ type: 'error', error: e?.message || 'Sync failed' });
  }

  res.end();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const body = parseBody(req);
  let dateFilter;
  try {
    dateFilter = parseDateFilter(body);
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
  const includeSynced = parseIncludeSynced(body);
  const syncedJobIds = includeSynced ? parseSyncedJobIds(body) : null;
  const excludedUnsyncedJobIds = parseExcludedUnsyncedJobIds(body);
  const includeSyncedDateError = getIncludeSyncedDateRangeError(includeSynced, dateFilter);
  if (includeSyncedDateError) {
    return res.status(400).json({
      success: false,
      error: includeSyncedDateError,
    });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  let pickerRequest;
  let jobIds;
  try {
    pickerRequest = parsePickerRequest(body);
    jobIds = parseJobIds(body);
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }

  if (pickerRequest) {
    const synced = pickerRequest.list === PICKER_LISTS.SYNCED;
    if (synced && !hasDateRange(dateFilter)) {
      return res.status(400).json({
        success: false,
        error: getIncludeSyncedDateRangeError(true, dateFilter),
      });
    }
    try {
      const picker = await fetchJobsForPicker(supabase, dateFilter, {
        synced,
        search: pickerRequest.search,
      });
      return res.status(200).json({ success: true, list: pickerRequest.list, ...picker });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Job search failed' });
    }
  }

  if (body.preview === true) {
    try {
      const preview = await getSyncPreview(supabase, dateFilter, {
        includeSynced,
        syncedJobIds,
        excludedUnsyncedJobIds,
        withPickerLists: true,
      });
      return res.status(200).json(preview);
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Preview failed' });
    }
  }

  if (body.plan === true) {
    try {
      const preview = await getSyncPreview(supabase, dateFilter, { includeSynced, syncedJobIds, excludedUnsyncedJobIds });
      const jobs = await fetchJobsForSapSync(supabase, preview.toProcess, dateFilter, {
        includeSynced,
        syncedJobIds,
        excludedUnsyncedJobIds,
      });
      return res.status(200).json({
        success: true,
        jobs: jobs.map(({ id, job_number }) => ({ id, job_number })),
        total: jobs.length,
        message: preview.message,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Could not plan sync' });
    }
  }

  const sessionCookies = sapService.getSessionCookies(req);
  if (!sessionCookies) {
    return res.status(401).json({
      success: false,
      error: 'SAP session required',
      message: 'Please log in to SAP Business One and try again.',
    });
  }

  const useStream = body.stream === true;
  const onAudit = (row, result) => logPerJobSyncAudit(req, row, result);

  if (!useStream) {
    try {
      const preview = await getSyncPreview(supabase, dateFilter, { includeSynced, syncedJobIds, excludedUnsyncedJobIds });
      const totalUnsynced = preview.unsyncedJobs;
      const limit = resolveBatchLimit(body, preview.toProcess);
      const jobs = await fetchJobsForSapSync(supabase, limit, dateFilter, {
        includeSynced,
        syncedJobIds,
        excludedUnsyncedJobIds,
      });
      await logJobSyncLifecycle(req, 'started', {
        processed: jobs.length,
        totalUnsynced,
        includeSynced,
        syncedInRange: preview.syncedInRange,
        toProcess: preview.toProcess,
        syncAll: body?.syncAll === true,
        dateFrom: dateFilter?.dateFrom ?? null,
        dateTo: dateFilter?.dateTo ?? null,
        dateField: dateFilter.dateField,
      });
      const results = await runBatchSync({ supabase, sessionCookies, jobs, onAudit });
      const remainingUnsynced = await countJobs(supabase, { unsyncedOnly: true, dateFilter });

      await logJobSyncLifecycle(req, 'completed', {
        synced: results.synced,
        failed: results.failed,
        processed: jobs.length,
        totalUnsynced,
        remainingUnsynced,
        includeSynced,
        syncedInRange: preview.syncedInRange,
        syncAll: body?.syncAll === true,
        dateFrom: dateFilter?.dateFrom ?? null,
        dateTo: dateFilter?.dateTo ?? null,
        dateField: dateFilter.dateField,
      });

      return res.status(200).json({
        success: true,
        message: `Synced ${results.synced} jobs, ${results.failed} failed`,
        totalUnsynced,
        includeSynced,
        syncedInRange: preview.syncedInRange,
        processed: jobs.length,
        remainingUnsynced,
        concurrency: SYNC_CONCURRENCY,
        ...results,
      });
    } catch (e) {
      await logJobSyncLifecycle(req, 'completed', {
        error: e?.message || 'Sync failed',
        processed: 0,
      });
      return res.status(500).json({ success: false, error: e?.message || 'Sync failed' });
    }
  }

  const send = openEventStream(res);

  if (jobIds) {
    await streamChunkSync({ req, res, send, supabase, sessionCookies, jobIds, dateFilter, body, onAudit });
    return;
  }

  try {
    const preview = await getSyncPreview(supabase, dateFilter, { includeSynced, syncedJobIds, excludedUnsyncedJobIds });
    const totalUnsynced = preview.unsyncedJobs;
    const limit = resolveBatchLimit(body, preview.toProcess);

    send({
      type: 'start',
      totalUnsynced,
      totalUnsyncedAll: preview.totalUnsyncedAll,
      totalJobs: preview.totalJobs,
      syncedJobs: preview.syncedJobs,
      syncedInRange: preview.syncedInRange,
      includeSynced,
      toProcess: preview.toProcess,
      processing: limit,
      syncAll: body.syncAll === true,
      concurrency: SYNC_CONCURRENCY,
      hasDateFilter: preview.hasDateFilter,
      dateFrom: preview.dateFrom,
      dateTo: preview.dateTo,
      message:
        preview.toProcess === 0
          ? preview.message || 'No jobs to sync.'
          : includeSynced
            ? `Syncing ${limit.toLocaleString()} job(s) to SAP (${SYNC_CONCURRENCY} parallel), including updates for jobs already in SAP…`
            : `Syncing ${limit.toLocaleString()} unsynced job(s) to SAP (${SYNC_CONCURRENCY} parallel)…`,
    });

    if (preview.toProcess === 0 || limit === 0) {
      await logJobSyncLifecycle(req, 'started', {
        processed: 0,
        totalUnsynced: 0,
        includeSynced,
      });
      await logJobSyncLifecycle(req, 'completed', {
        synced: 0,
        failed: 0,
        processed: 0,
        totalUnsynced: 0,
        remainingUnsynced: 0,
        includeSynced,
      });
      send({
        type: 'done',
        success: true,
        synced: 0,
        failed: 0,
        errors: [],
        totalUnsynced: 0,
        includeSynced,
        processed: 0,
        remainingUnsynced: 0,
        message: preview.message || 'No jobs to sync.',
      });
      res.end();
      return;
    }

    send({
      type: 'log',
      status: 'info',
      message: `Loaded ${limit.toLocaleString()} job(s). Do not refresh until complete.`,
    });

    const jobs = await fetchJobsForSapSync(supabase, limit, dateFilter, {
        includeSynced,
        syncedJobIds,
        excludedUnsyncedJobIds,
      });

    await logJobSyncLifecycle(req, 'started', {
      processed: jobs.length,
      totalUnsynced,
      includeSynced,
      syncedInRange: preview.syncedInRange,
      toProcess: preview.toProcess,
      syncAll: body.syncAll === true,
      stream: true,
      dateFrom: preview.dateFrom,
      dateTo: preview.dateTo,
      dateField: dateFilter.dateField,
    });

    const results = await runBatchSync({
      supabase,
      sessionCookies,
      jobs,
      onAudit,
      onProgress: (p) => send({ type: 'progress', ...p }),
      onLog: (entry) => send({ type: 'log', ts: new Date().toISOString(), ...entry }),
    });

    const remainingUnsynced = await countJobs(supabase, { unsyncedOnly: true, dateFilter });

    await logJobSyncLifecycle(req, 'completed', {
      synced: results.synced,
      failed: results.failed,
      processed: jobs.length,
      totalUnsynced,
      remainingUnsynced,
      includeSynced,
      syncedInRange: preview.syncedInRange,
      syncAll: body.syncAll === true,
      stream: true,
      dateFrom: preview.dateFrom,
      dateTo: preview.dateTo,
      dateField: dateFilter.dateField,
    });

    send({
      type: 'done',
      success: true,
      message: `Synced ${results.synced} jobs, ${results.failed} failed`,
      totalUnsynced,
      includeSynced,
      processed: jobs.length,
      remainingUnsynced,
      concurrency: SYNC_CONCURRENCY,
      ...results,
    });
  } catch (e) {
    await logJobSyncLifecycle(req, 'completed', {
      error: e?.message || 'Sync failed',
      stream: true,
      includeSynced,
      dateFrom: dateFilter?.dateFrom ?? null,
      dateTo: dateFilter?.dateTo ?? null,
      dateField: dateFilter.dateField,
    });
    send({ type: 'error', error: e?.message || 'Sync failed' });
  }

  res.end();
}
