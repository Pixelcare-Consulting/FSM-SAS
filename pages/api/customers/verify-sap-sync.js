/**
 * POST /api/customers/verify-sap-sync
 * Preview or re-sync portal customers against the current SAP company DB.
 *
 * Body/query:
 *   preview: true  — bucket customers (exists_in_sap, missing_in_sap, no_sap_card_code)
 *   resync: true   — re-sync missing customers (batched)
 *   include_jobs: true — clear jobs.sap_activity_id for affected customers
 *   offset, limit  — pagination (cap 25)
 */

import { requireAdminUser } from '../company-memos/_auth';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import sapService, {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../../../lib/services/sapService';
import {
  previewSapCustomerVerification,
  resyncMissingSapCustomersPage,
  VERIFY_BATCH_CAP,
  getCurrentSapEnvironment,
} from '../../../lib/customers/verifySapCustomerSync';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../lib/services/auditLog';

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function parsePagination(body, query) {
  const offset = Math.max(Number(body.offset ?? query.offset ?? 0) || 0, 0);
  const rawLimit = Number(body.limit ?? query.limit ?? VERIFY_BATCH_CAP) || VERIFY_BATCH_CAP;
  const limit = Math.min(Math.max(rawLimit, 1), VERIFY_BATCH_CAP);
  return { offset, limit };
}

async function resolveSessionCookies(req, isCronAuthorized) {
  if (!isCronAuthorized) {
    const browserCookies = sapService.getSessionCookies(req);
    if (browserCookies) return browserCookies;
  }
  const login = await loginSessionCookiesFromEnvironment();
  return unwrapSapEnvironmentLogin(login);
}

async function logVerifyAudit(req, summary, status) {
  await writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.SAP_CUSTOMER_SYNC,
    category: AUDIT_CATEGORIES.SAP,
    entityType: 'customer',
    entityId: null,
    entityLabel: summary.mode || 'verify-sap-sync',
    description:
      status === AUDIT_STATUS.SUCCESS
        ? `SAP customer verify/resync completed (${summary.mode})`
        : `SAP customer verify/resync failed (${summary.mode})`,
    details: summary,
    status,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Sync-Delta-Secret'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const cronSecret = String(process.env.SYNC_DELTA_CRON_SECRET || '').trim();
  const requestSecret = String(req.headers['x-sync-delta-secret'] || '').trim();
  const isCronAuthorized = Boolean(cronSecret && requestSecret && cronSecret === requestSecret);

  if (!isCronAuthorized) {
    const auth = await requireAdminUser(req, res);
    if (!auth) return;
  }

  const body = parseBody(req);
  const isPreview = body.preview === true || req.query.preview === 'true';
  const isResync = body.resync === true || req.query.resync === 'true';
  const includeJobs = body.include_jobs === true || req.query.include_jobs === 'true';
  const { offset, limit } = parsePagination(body, req.query);

  if (!isPreview && !isResync) {
    return res.status(400).json({
      success: false,
      error: 'Specify preview:true or resync:true',
    });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();

  try {
    const sessionCookies = await resolveSessionCookies(req, isCronAuthorized);
    if (!sessionCookies) {
      const summary = {
        mode: isResync ? 'resync' : 'preview',
        error: 'SAP session unavailable — log in to SAP or configure SAP_B1_* env vars',
        sapEnvironment: getCurrentSapEnvironment(),
        elapsedMs: Date.now() - startedAt,
      };
      await logVerifyAudit(req, summary, AUDIT_STATUS.FAILURE);
      return res.status(422).json({ success: false, ...summary });
    }

    if (isResync) {
      const { preview, resync, error } = await resyncMissingSapCustomersPage({
        supabase,
        sessionCookies,
        offset,
        limit,
        includeJobs,
        req,
      });

      if (error) {
        const summary = {
          mode: 'resync',
          error,
          sapEnvironment: getCurrentSapEnvironment(),
          elapsedMs: Date.now() - startedAt,
        };
        await logVerifyAudit(req, summary, AUDIT_STATUS.FAILURE);
        return res.status(422).json({ success: false, ...summary });
      }

      const summary = {
        mode: 'resync',
        sapEnvironment: getCurrentSapEnvironment(),
        pagination: preview.pagination,
        counts: preview.counts,
        resync: {
          linked: resync.results.linked.length,
          created: resync.results.created.length,
          existing: resync.results.existing.length,
          failed: resync.results.failed.length,
          jobsCleared: resync.jobsCleared,
        },
        failures: resync.results.failed.slice(0, 10),
        elapsedMs: Date.now() - startedAt,
      };

      const hasFailures = resync.results.failed.length > 0;
      await logVerifyAudit(req, summary, hasFailures ? AUDIT_STATUS.WARNING : AUDIT_STATUS.SUCCESS);

      return res.status(200).json({
        success: true,
        resync: true,
        preview,
        results: resync.results,
        jobsCleared: resync.jobsCleared,
        summary,
      });
    }

    const preview = await previewSapCustomerVerification({
      supabase,
      sessionCookies,
      offset,
      limit,
    });

    if (preview.error) {
      const summary = {
        mode: 'preview',
        error: preview.error,
        sapEnvironment: getCurrentSapEnvironment(),
        elapsedMs: Date.now() - startedAt,
      };
      await logVerifyAudit(req, summary, AUDIT_STATUS.FAILURE);
      return res.status(422).json({ success: false, ...summary });
    }

    const summary = {
      mode: 'preview',
      sapEnvironment: preview.sapEnvironment,
      pagination: preview.pagination,
      counts: preview.counts,
      elapsedMs: Date.now() - startedAt,
    };
    await logVerifyAudit(req, summary, AUDIT_STATUS.SUCCESS);

    return res.status(200).json({
      success: true,
      preview: true,
      buckets: preview.buckets,
      pagination: preview.pagination,
      counts: preview.counts,
      sapEnvironment: preview.sapEnvironment,
      summary,
    });
  } catch (error) {
    const summary = {
      mode: isResync ? 'resync' : 'preview',
      error: error?.message || 'Verify failed',
      sapEnvironment: getCurrentSapEnvironment(),
      elapsedMs: Date.now() - startedAt,
    };
    await logVerifyAudit(req, summary, AUDIT_STATUS.FAILURE);
    return res.status(500).json({ success: false, ...summary });
  }
}
