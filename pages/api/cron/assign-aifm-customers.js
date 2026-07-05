/**
 * Background: link AIFM jobs (NULL customer_id + [CUSTOMER:…] tag) to portal customers.
 *
 * POST or GET
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>  (for simple schedulers)
 *
 * Env:
 *   CRON_SECRET or AIFM_ASSIGN_CRON_SECRET — required
 *   SAP_B1_* — optional; when set, logs in server-side and runs SAP CardName lookup (same as interactive Assign Customers)
 *   AIFM_API_TOKEN — optional; fills service_location from AIFM Open API for jobs with [AIFM:<id>] when tags/DB have no address
 *
 * Query/body: limit (default 200, max 50000) — max jobs per run for address sync + customer assign (paginated internally)
 *
 * Schedule (e.g. hourly) with OS cron, Vercel Cron, or Task Scheduler calling this URL.
 */

import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { loginSessionCookiesFromEnvironment } from '../../../lib/services/sapService';
import { runAifmAddressSyncPass } from '../../../lib/integrations/aifmAddressSyncPass';
import { runAifmLinkedJobsLocationEnrichmentPass } from '../../../lib/integrations/aifmLinkedLocationEnrichment';
import { runAifmCustomerAssignmentPass } from '../../../lib/integrations/aifmAssignCustomersCore';

function getCronSecret() {
  return (process.env.CRON_SECRET || process.env.AIFM_ASSIGN_CRON_SECRET || '').trim();
}

function verifyCronSecret(req) {
  const secret = getCronSecret();
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const q = typeof req.query?.secret === 'string' ? req.query.secret : '';
  return bearer === secret || q === secret;
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

  const rawLimit = req.method === 'GET' ? req.query?.limit : req.body?.limit;
  const maxJobs = Math.min(Math.max(Number(rawLimit) || 200, 1), 50000);

  try {
    const supabase = getSupabaseAdmin();

    let sapCookies = null;
    let sapLoginMeta = { ok: false, error: 'skipped' };
    const sapLogin = await loginSessionCookiesFromEnvironment();
    if (sapLogin.ok && sapLogin.cookies) {
      sapCookies = sapLogin.cookies;
      sapLoginMeta = { ok: true, error: null };
    } else {
      sapLoginMeta = { ok: false, error: sapLogin.error || 'sap_login_failed' };
    }

    const addressSync = await runAifmAddressSyncPass(supabase, {
      maxJobs,
      log: (...args) => console.log('[cron/assign-aifm-customers]', ...args),
    });

    const summary = await runAifmCustomerAssignmentPass(supabase, {
      sapCookies,
      maxJobs,
      log: (...args) => console.log('[cron/assign-aifm-customers]', ...args),
    });

    const linkedLocationEnrichment = await runAifmLinkedJobsLocationEnrichmentPass(supabase, {
      maxJobs,
      log: (...args) => console.log('[cron/assign-aifm-customers]', ...args),
    });

    return res.status(200).json({
      success: true,
      sapEnvLogin: sapLoginMeta,
      addressSync,
      ...summary,
      linkedLocationEnrichment,
    });
  } catch (e) {
    console.error('[cron/assign-aifm-customers]', e);
    return res.status(500).json({
      success: false,
      error: e?.message || 'assign_failed',
    });
  }
}
