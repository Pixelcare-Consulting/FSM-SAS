/**
 * Phase 2: Batch job sync to SAP.
 * POST /api/jobs/sync-hourly
 * Body:
 *   { preview: true } — counts only, no sync
 *   { stream: true, syncAll: true } — SSE live sync (all unsynced jobs)
 *   { limit?: number } — capped batch (cron/scripts)
 *
 * Requires SAP session cookies (except preview-only without SAP — preview doesn't need SAP).
 */

import { getSupabaseAdmin } from '../../../lib/supabase/server';
import sapService from '../../../lib/services/sapService';
import {
  countJobs,
  fetchAllUnsyncedJobRows,
  getSyncPreview,
  parseDateFilter,
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
  const dateFilter = parseDateFilter(body);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  if (body.preview === true) {
    try {
      const preview = await getSyncPreview(supabase, dateFilter);
      return res.status(200).json(preview);
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Preview failed' });
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
      const totalUnsynced = await countJobs(supabase, { unsyncedOnly: true, dateFilter });
      const limit = resolveBatchLimit(body, totalUnsynced);
      const jobs = await fetchAllUnsyncedJobRows(supabase, limit, dateFilter);
      await logJobSyncLifecycle(req, 'started', {
        processed: jobs.length,
        totalUnsynced,
        syncAll: body?.syncAll === true,
        dateFrom: dateFilter?.dateFrom ?? null,
        dateTo: dateFilter?.dateTo ?? null,
      });
      const results = await runBatchSync({ supabase, sessionCookies, jobs, onAudit });
      const remainingUnsynced = await countJobs(supabase, { unsyncedOnly: true, dateFilter });

      await logJobSyncLifecycle(req, 'completed', {
        synced: results.synced,
        failed: results.failed,
        processed: jobs.length,
        totalUnsynced,
        remainingUnsynced,
        syncAll: body?.syncAll === true,
        dateFrom: dateFilter?.dateFrom ?? null,
        dateTo: dateFilter?.dateTo ?? null,
      });

      return res.status(200).json({
        success: true,
        message: `Synced ${results.synced} jobs, ${results.failed} failed`,
        totalUnsynced,
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

  const send = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  try {
    res.socket?.setNoDelay(true);
  } catch (_) {}

  try {
    const preview = await getSyncPreview(supabase, dateFilter);
    const totalUnsynced = preview.unsyncedJobs;
    const limit = resolveBatchLimit(body, totalUnsynced);

    send({
      type: 'start',
      totalUnsynced,
      totalUnsyncedAll: preview.totalUnsyncedAll,
      totalJobs: preview.totalJobs,
      syncedJobs: preview.syncedJobs,
      processing: limit,
      syncAll: body.syncAll === true,
      concurrency: SYNC_CONCURRENCY,
      hasDateFilter: preview.hasDateFilter,
      dateFrom: preview.dateFrom,
      dateTo: preview.dateTo,
      message:
        totalUnsynced === 0
          ? preview.message || 'No unsynced jobs found.'
          : `Syncing ${limit.toLocaleString()} unsynced job(s) to SAP (${SYNC_CONCURRENCY} parallel)…`,
    });

    if (totalUnsynced === 0 || limit === 0) {
      await logJobSyncLifecycle(req, 'started', { processed: 0, totalUnsynced: 0 });
      await logJobSyncLifecycle(req, 'completed', {
        synced: 0,
        failed: 0,
        processed: 0,
        totalUnsynced: 0,
        remainingUnsynced: 0,
      });
      send({
        type: 'done',
        success: true,
        synced: 0,
        failed: 0,
        errors: [],
        totalUnsynced: 0,
        processed: 0,
        remainingUnsynced: 0,
        message: 'No unsynced jobs to sync.',
      });
      res.end();
      return;
    }

    send({
      type: 'log',
      status: 'info',
      message: `Loaded ${limit.toLocaleString()} job(s). Do not refresh until complete.`,
    });

    const jobs = await fetchAllUnsyncedJobRows(supabase, limit, dateFilter);

    await logJobSyncLifecycle(req, 'started', {
      processed: jobs.length,
      totalUnsynced,
      syncAll: body.syncAll === true,
      stream: true,
      dateFrom: preview.dateFrom,
      dateTo: preview.dateTo,
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
      syncAll: body.syncAll === true,
      stream: true,
      dateFrom: preview.dateFrom,
      dateTo: preview.dateTo,
    });

    send({
      type: 'done',
      success: true,
      message: `Synced ${results.synced} jobs, ${results.failed} failed`,
      totalUnsynced,
      processed: jobs.length,
      remainingUnsynced,
      concurrency: SYNC_CONCURRENCY,
      ...results,
    });
  } catch (e) {
    await logJobSyncLifecycle(req, 'completed', {
      error: e?.message || 'Sync failed',
      stream: true,
      dateFrom: dateFilter?.dateFrom ?? null,
      dateTo: dateFilter?.dateTo ?? null,
    });
    send({ type: 'error', error: e?.message || 'Sync failed' });
  }

  res.end();
}
