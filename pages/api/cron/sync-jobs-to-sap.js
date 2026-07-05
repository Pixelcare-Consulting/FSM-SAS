/**
 * Scheduled batch sync of unsynced portal jobs to SAP.
 *
 * GET or POST (Vercel Cron uses GET)
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>
 *
 * Env:
 *   CRON_SECRET — required
 *   SAP_B1_* — required for sync
 *   JOB_SYNC_CRON_TZ — default Asia/Manila
 *   JOB_SYNC_CRON_START_HOUR — default 7 (inclusive)
 *   JOB_SYNC_CRON_END_HOUR — default 24 (exclusive; 24 = through 11:59 PM)
 *
 * Query/body: limit (default 50, max 200)
 */

import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { loginSessionCookiesFromEnvironment } from '../../../lib/services/sapService';
import {
  countJobs,
  DEFAULT_LIMIT,
  fetchAllUnsyncedJobRows,
  MAX_LIMIT,
  runBatchSync,
  SYNC_CONCURRENCY,
} from '../../../lib/jobs/syncJobsBatch';
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_SOURCE,
  AUDIT_STATUS,
  JOB_SYNC_LIFECYCLE,
  logJobSyncResult,
  writeAuditLogFromRequest,
} from '../../../lib/services/auditLog';

function getCronSecret() {
  return (process.env.CRON_SECRET || '').trim();
}

function verifyCronSecret(req) {
  const secret = getCronSecret();
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const q = typeof req.query?.secret === 'string' ? req.query.secret : '';
  return bearer === secret || q === secret;
}

function getLocalHourInTz(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  return Number(formatter.format(new Date()));
}

function isWithinSyncWindow() {
  const tz = (process.env.JOB_SYNC_CRON_TZ || 'Asia/Manila').trim();
  const startHour = Number(process.env.JOB_SYNC_CRON_START_HOUR) || 7;
  const endHour = Number(process.env.JOB_SYNC_CRON_END_HOUR) || 24;
  const hour = getLocalHourInTz(tz);
  return hour >= startHour && hour < endHour;
}

function logCronJobSyncAudit(req, fields) {
  return writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.JOB_SYNC_SAP,
    category: AUDIT_CATEGORIES.SAP,
    source: AUDIT_SOURCE.CRON,
    userName: 'Scheduled Job Sync',
    ...fields,
  });
}

async function logCronLifecycle(req, phase, extra = {}) {
  const isStart = phase === 'started';
  await logCronJobSyncAudit(req, {
    entityType: 'job_sync',
    entityLabel: 'Job Sync',
    description: isStart ? JOB_SYNC_LIFECYCLE.STARTED : JOB_SYNC_LIFECYCLE.COMPLETED,
    details: {
      phase,
      ...extra,
    },
    status: extra.error ? AUDIT_STATUS.FAILURE : AUDIT_STATUS.SUCCESS,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!verifyCronSecret(req)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Set CRON_SECRET and pass Authorization: Bearer <secret> or ?secret=',
    });
  }

  if (!isWithinSyncWindow()) {
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: 'outside_sync_window',
    });
  }

  const rawLimit = req.method === 'GET' ? req.query?.limit : req.body?.limit;
  const limit = Math.min(Math.max(Number(rawLimit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  try {
    const supabase = getSupabaseAdmin();

    const sapLogin = await loginSessionCookiesFromEnvironment();
    if (!sapLogin.ok || !sapLogin.cookies) {
      return res.status(422).json({
        success: false,
        error: sapLogin.error || 'SAP_B1_* login failed',
      });
    }

    const sessionCookies = sapLogin.cookies;
    const totalUnsynced = await countJobs(supabase, { unsyncedOnly: true });
    const jobs = await fetchAllUnsyncedJobRows(supabase, limit);

    await logCronLifecycle(req, 'started', {
      processed: jobs.length,
      totalUnsynced,
      limit,
    });

    if (jobs.length === 0) {
      await logCronLifecycle(req, 'completed', {
        synced: 0,
        failed: 0,
        processed: 0,
        totalUnsynced: 0,
        remainingUnsynced: 0,
      });
      return res.status(200).json({
        success: true,
        synced: 0,
        failed: 0,
        errors: [],
        totalUnsynced: 0,
        processed: 0,
        remainingUnsynced: 0,
        concurrency: SYNC_CONCURRENCY,
        message: 'No unsynced jobs to sync.',
      });
    }

    const onAudit = (row, result) => {
      logJobSyncResult({
        req,
        jobId: row.id,
        jobNumber: result.job_number ?? row.job_number,
        result,
        source: AUDIT_SOURCE.CRON,
        userName: 'Scheduled Job Sync',
      });
    };

    const results = await runBatchSync({
      supabase,
      sessionCookies,
      jobs,
      onAudit,
    });

    const remainingUnsynced = await countJobs(supabase, { unsyncedOnly: true });

    await logCronLifecycle(req, 'completed', {
      synced: results.synced,
      failed: results.failed,
      processed: jobs.length,
      totalUnsynced,
      remainingUnsynced,
      limit,
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
    console.error('[cron/sync-jobs-to-sap]', e);
    await logCronLifecycle(req, 'completed', {
      error: e?.message || 'Sync failed',
      processed: 0,
    });
    return res.status(500).json({
      success: false,
      error: e?.message || 'sync_failed',
    });
  }
}
