/**
 * Proxy AI-FM Open API: authorize + job list (read-only, no DB writes).
 *
 * Two modes:
 *  POST  → SSE stream of progress events; final event carries a result token
 *  GET ?token=xxx → returns the cached result (one-time, expires in 2 min)
 *
 * Keeping the jobs payload OUT of the SSE stream avoids Turbopack response-
 * buffering issues that caused the modal to hang when sending large payloads.
 */

import crypto from 'crypto';
import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { customerService } from '../../../../lib/supabase/database';
import { enrichAifmJobsWithSupabaseMasterlist } from '../../../../lib/integrations/aifmSupabaseMasterlistEnrichment';
import {
  buildAifmCustomerDirectoryMap,
  fetchAifmCustomersDirectory,
} from '../../../../lib/integrations/aifmApiClient';
import { enrichAifmJobsWithCustomerDirectory } from '../../../../lib/integrations/aifmCustomerAccountEnrichment';
import { enrichAifmJobsWithLiveSapLookup } from '../../../../lib/integrations/aifmCustomerSapResolver';
import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../../../../lib/services/sapService';

// Module-level result cache (single-server dev tool — fine for this use case)
const resultCache = new Map(); // token -> { payload, expiresAt }

function storeResult(payload) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 2 * 60 * 1000;
  resultCache.set(token, { payload, expiresAt });
  // Lazy GC: clean expired entries on each store
  for (const [k, v] of resultCache) {
    if (v.expiresAt < Date.now()) resultCache.delete(k);
  }
  return token;
}

export const config = { api: { responseLimit: false } };

const DEFAULT_BASE = 'https://apacapiopen.aifieldmanagement.com';

function normalizeBase(url) {
  const u = (url || DEFAULT_BASE).trim().replace(/\/+$/, '');
  return u || DEFAULT_BASE;
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start_date: fmt(start), end_date: fmt(end) };
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

const AUTH_TIMEOUT_MS = 15_000;
const JOBS_TIMEOUT_MS = 30_000;
const CUSTOMER_TIMEOUT_MS = 12_000;
const CUSTOMER_CONCURRENCY = 6;

export default async function handler(req, res) {
  // ── GET ?token — retrieve cached result ──────────────────────────────────
  if (req.method === 'GET' && req.query.token) {
    const session = await requireSession(req, res);
    if (!session) return;

    const entry = resultCache.get(req.query.token);
    if (!entry || entry.expiresAt < Date.now()) {
      resultCache.delete(req.query.token);
      return res.status(404).json({ success: false, error: 'Result not found or expired. Fetch again.' });
    }
    resultCache.delete(req.query.token); // one-time use
    return res.status(200).json(entry.payload);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const apiToken = (process.env.AIFM_API_TOKEN || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!apiToken) {
    return res.status(503).json({
      success: false,
      code: 'AIFM_NOT_CONFIGURED',
      error: 'AIFM is not configured. Set AIFM_API_TOKEN (Company API secret from AIFM).',
    });
  }

  const base = normalizeBase(process.env.AIFM_BASE_URL);

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }
  let { start_date, end_date } = body;
  const resolve_service_locations = Boolean(body.resolve_service_locations);
  const resolve_equipment = Boolean(body.resolve_equipment);

  if (!start_date || !end_date) {
    const d = defaultDateRange();
    start_date = start_date || d.start_date;
    end_date = end_date || d.end_date;
  }

  // ── Commit to SSE stream (progress only — no large payload) ──────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // Flush headers immediately so browser opens the SSE connection
  res.flushHeaders();

  // Disable Nagle so small writes reach the browser right away
  try { res.socket?.setNoDelay(true); } catch (_) {}

  const send = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  const tag = `[aifm/jobs ${new Date().toISOString()}]`;
  const log = (...args) => console.log(tag, ...args);

  log('START', { start_date, end_date, resolve_service_locations, resolve_equipment });

  try {
    // ── Step 1: Authorize ──────────────────────────────────────────────────
    send({ type: 'step', phase: 'auth', message: 'Authorizing with AIFM…' });
    log('→ authorize');

    let authJson;
    for (const bodyObj of [{ secret: apiToken }, { api_token: apiToken }]) {
      let authRes;
      try {
        authRes = await fetchWithTimeout(
          `${base}/api/v1/authorize`,
          { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) },
          AUTH_TIMEOUT_MS
        );
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          send({ type: 'error', error: `AIFM authorization timed out after ${AUTH_TIMEOUT_MS / 1000}s.` });
          return res.end();
        }
        throw fetchErr;
      }
      authJson = await authRes.json().catch(() => ({}));
      if (Number(authJson.code) === 200 && authJson.data?.token) break;
    }

    if (Number(authJson.code) !== 200 || !authJson.data?.token) {
      send({ type: 'error', error: authJson.msg || 'AIFM authorization failed' });
      return res.end();
    }

    const bearer = authJson.data.token;
    log('✓ authorized');

    // ── Step 2: Fetch jobs (paginated) ────────────────────────────────────
    send({ type: 'step', phase: 'jobs', message: 'Fetching jobs from AIFM…' });
    log('→ fetch jobs (paginated)');

    const AIFM_PAGE_SIZE = 50; // AIFM default page size
    const MAX_PAGES = 20;       // safety cap — 20 × 50 = 1 000 jobs max

    /**
     * Fetch a single page of jobs. Tries the known body variants in order,
     * returning the first that gives code 200.
     */
    async function fetchJobsPage(page) {
      const bodyVariants = [
        { api_token: bearer, start_date, end_date, page, per_page: AIFM_PAGE_SIZE },
        { api_token: bearer, start_date, end_date, page, limit: AIFM_PAGE_SIZE },
        { api_token: bearer, start_date, end_date },   // fallback: no pagination params
      ];

      for (const jobBody of bodyVariants) {
        let jobsRes;
        try {
          jobsRes = await fetchWithTimeout(
            `${base}/api/v1/jobs`,
            {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${bearer}`,
              },
              body: JSON.stringify(jobBody),
            },
            JOBS_TIMEOUT_MS
          );
        } catch (fetchErr) {
          if (fetchErr.name === 'AbortError') {
            return { error: `AIFM jobs timed out after ${JOBS_TIMEOUT_MS / 1000}s.` };
          }
          throw fetchErr;
        }
        const json = await jobsRes.json().catch(() => ({}));
        if (Number(json.code) === 200) return { json };
      }
      return { json: {} }; // all variants failed
    }

    // Page 1
    const page1Result = await fetchJobsPage(1);
    if (page1Result.error) {
      send({ type: 'error', error: page1Result.error });
      return res.end();
    }
    let jobsJson = page1Result.json;

    if (Number(jobsJson.code) !== 200) {
      send({ type: 'error', error: jobsJson.msg || 'AIFM jobs request failed' });
      return res.end();
    }

    let jobs = Array.isArray(jobsJson.data) ? [...jobsJson.data] : [];
    const firstPageCount = jobs.length;
    log(`✓ page 1: ${firstPageCount} job(s)`);

    // Track all seen job IDs to detect if AIFM ignores page param and repeats data
    const seenIds = new Set(jobs.map((j) => String(j.id)));

    // Determine whether to attempt more pages:
    // Only if the API returned exactly AIFM_PAGE_SIZE — otherwise it's the last page already.
    const totalHint =
      jobsJson.total ??
      jobsJson.total_count ??
      jobsJson.count ??
      jobsJson.data_count ??
      null;
    let apiPaginates = firstPageCount >= AIFM_PAGE_SIZE;

    if (apiPaginates) {
      log(`→ page 1 full (${firstPageCount}); probing page 2 to confirm API supports pagination…`);

      for (let page = 2; page <= MAX_PAGES; page++) {
        const result = await fetchJobsPage(page);
        if (result.error) {
          log(`⚠ page ${page} timed out — stopping pagination`);
          break;
        }
        const pageJson = result.json;
        const pageData = Array.isArray(pageJson.data) ? pageJson.data : [];

        if (Number(pageJson.code) !== 200 || pageData.length === 0) {
          log(`✓ page ${page}: empty or non-200 — pagination complete`);
          break;
        }

        // Duplicate-detection: if every ID on this page was already seen,
        // the API ignores the page param and is returning the same data → stop.
        const newJobs = pageData.filter((j) => !seenIds.has(String(j.id)));
        if (newJobs.length === 0) {
          log(`⚠ page ${page}: all ${pageData.length} job(s) already seen — API does not paginate, stopping`);
          apiPaginates = false;
          break;
        }

        // Add only the genuinely new jobs
        newJobs.forEach((j) => seenIds.add(String(j.id)));
        jobs = jobs.concat(newJobs);
        log(`✓ page ${page}: +${newJobs.length} new job(s) (total so far: ${jobs.length})`);
        send({ type: 'step', phase: 'jobs', message: `Fetched ${jobs.length} jobs so far (page ${page})…` });

        // Reached the total hint
        if (totalHint !== null && jobs.length >= Number(totalHint)) {
          log(`✓ reached total hint (${totalHint}) — pagination complete`);
          break;
        }

        // Fewer results than page size → last page
        if (pageData.length < AIFM_PAGE_SIZE) {
          log(`✓ page ${page} returned ${pageData.length} < ${AIFM_PAGE_SIZE} — last page`);
          break;
        }
      }
    } else {
      log(`→ page 1 returned ${firstPageCount} < ${AIFM_PAGE_SIZE} — single page, no further fetching`);
    }

    const meta = { start_date, end_date, count: jobs.length, code: jobsJson.code, msg: jobsJson.msg };
    log(`✓ jobs fetched total: ${jobs.length}${apiPaginates ? ' (paginated)' : ''}`);

    send({ type: 'step', phase: 'jobs_done', message: `${jobs.length} job(s) retrieved${apiPaginates ? ' (multiple pages)' : ''}.`, count: jobs.length });

    // ── Step 2b: AIFM customer directory (account `customer_name` vs contact on job rows) ──
    let customerDirectoryMap = null;
    if (jobs.length > 0) {
      send({ type: 'step', phase: 'aifm_customers', message: 'Loading AIFM customer accounts…' });
      const tDir = Date.now();
      try {
        const directoryRows = await fetchAifmCustomersDirectory(base, bearer);
        customerDirectoryMap = buildAifmCustomerDirectoryMap(directoryRows);
        const enrichedDir = enrichAifmJobsWithCustomerDirectory(jobs, directoryRows);
        jobs = enrichedDir.jobs;
        meta.aifm_customers_directory_ms = Date.now() - tDir;
        meta.aifm_customers_directory_size = enrichedDir.directorySize;
        meta.aifm_customers_jobs_enriched = enrichedDir.enrichedCount;
        log(
          `✓ AIFM customer directory: ${enrichedDir.directorySize} account(s), merged onto ${enrichedDir.enrichedCount}/${jobs.length} job(s) in ${meta.aifm_customers_directory_ms}ms`
        );
      } catch (e) {
        meta.aifm_customers_directory_lookup = 'error';
        meta.aifm_customers_directory_message = e?.message || 'AIFM customers directory failed';
        log(`⚠ AIFM customer directory: ${meta.aifm_customers_directory_message}`);
      }
    }

    // ── Step 3: Customer details from Supabase masterlist ──────────────────
    if (jobs.length > 0) {
      send({ type: 'step', phase: 'masterlist', message: 'Matching customers & SAP leads from Supabase masterlist…' });
      log('→ customer details: Supabase masterlist (customers + sap_lead)');
      const tCustomer = Date.now();
      try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
          meta.masterlist_lookup = 'error';
          meta.masterlist_message = 'Database unavailable';
          log('⚠ masterlist: database unavailable');
        } else {
          const [customerRows, leadRows] = await Promise.all([
            customerService.getSapMasterlistCustomers(supabase),
            customerService.getSapMasterlistLeads(supabase),
          ]);
          const enriched = enrichAifmJobsWithSupabaseMasterlist(jobs, customerRows, leadRows);
          jobs = enriched.jobs;
          meta.masterlist_lookup = 'ok';
          meta.masterlist_rows = enriched.totalCustomers;
          meta.masterlist_lead_rows = enriched.totalLeads;
          meta.masterlist_matched = enriched.matched;
          meta.masterlist_matched_leads = enriched.matchedLeads ?? 0;
          meta.masterlist_rows_with_customer = jobs.filter((j) => j.customer_name || j.customer_firstName || j.customer_lastName).length;
          meta.masterlist_ms = Date.now() - tCustomer;
          log(
            `✓ masterlist: matched ${enriched.matched}/${jobs.length} job(s) ` +
              `(${enriched.matchedLeads ?? 0} via SAP leads) from ${enriched.totalCustomers} customer + ${enriched.totalLeads} lead row(s) in ${meta.masterlist_ms}ms`
          );
        }
      } catch (e) {
        meta.masterlist_lookup = 'error';
        meta.masterlist_message = e?.message || 'Supabase masterlist lookup failed';
        log(`⚠ masterlist error: ${meta.masterlist_message}`);
      }
    }

    // ── Step 3b: Live SAP Service Layer (C then L) for remaining unmatched accounts ──
    if (jobs.length > 0) {
      const stillUnmatched = jobs.filter((j) => !(j.sap_card_code || '').toString().trim()).length;
      if (stillUnmatched > 0) {
        send({
          type: 'step',
          phase: 'sap_live',
          message: `Querying SAP for ${stillUnmatched} job(s) without CardCode…`,
        });
        const tSap = Date.now();
        try {
          const sapLogin = await loginSessionCookiesFromEnvironment();
          const sapCookies = unwrapSapEnvironmentLogin(sapLogin);
          if (!sapCookies) {
            meta.sap_live_lookup = 'skipped';
            meta.sap_live_message = sapLogin?.error || 'SAP login failed';
            log(`⚠ SAP live lookup skipped: ${meta.sap_live_message}`);
          } else {
            const sapEnriched = await enrichAifmJobsWithLiveSapLookup(jobs, sapCookies, {
              directoryMap: customerDirectoryMap,
            });
            jobs = sapEnriched.jobs;
            meta.sap_live_lookup = 'ok';
            meta.sap_live_matched = sapEnriched.matched;
            meta.sap_live_unique_accounts = sapEnriched.uniqueNames;
            meta.sap_live_ms = Date.now() - tSap;
            log(
              `✓ SAP live: ${sapEnriched.matched} job(s) matched (${sapEnriched.uniqueNames} account name(s) queried) in ${meta.sap_live_ms}ms`
            );
          }
        } catch (e) {
          meta.sap_live_lookup = 'error';
          meta.sap_live_message = e?.message || 'SAP live lookup failed';
          log(`⚠ SAP live lookup: ${meta.sap_live_message}`);
        }
      }
    }

    // ── Step 4: Service Locations + Equipment ──────────────────────────────
    if ((resolve_service_locations || resolve_equipment) && jobs.length > 0) {
      const uniqueCustomerIds = [
        ...new Set(jobs.map((j) => j.id_customer).filter((id) => id != null))
      ];
      const total = uniqueCustomerIds.length;

      const stepLabel = [
        resolve_service_locations && 'service locations',
        resolve_equipment && 'equipment'
      ].filter(Boolean).join(' & ');

      // Tell client how many customers to expect — allows it to show total
      log(`→ customer enrichment: ${total} unique customer(s), stepLabel="${stepLabel}"`);
      send({ type: 'progress', phase: 'customers', message: `Resolving ${stepLabel}…`, current: 0, total });

      const serviceLocMap = new Map();
      const equipmentMap = new Map();
      const chunks = [];
      for (let i = 0; i < uniqueCustomerIds.length; i += CUSTOMER_CONCURRENCY) {
        chunks.push(uniqueCustomerIds.slice(i, i + CUSTOMER_CONCURRENCY));
      }

      let processed = 0;
      const t1 = Date.now();

      for (const chunk of chunks) {
        const chunkStart = Date.now();
        await Promise.all(
          chunk.map(async (customerId) => {
            const postOpts = () => ({
              method: 'POST',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
              body: JSON.stringify({ api_token: bearer, customer_id: customerId })
            });

            const tasks = [];
            if (resolve_service_locations) {
              tasks.push(
                fetchWithTimeout(`${base}/api/v1/customers/service_locations`, postOpts(), CUSTOMER_TIMEOUT_MS)
                  .then((r) => r.json()).catch(() => ({}))
                  .then((locJson) => {
                    if (Number(locJson.code) === 200 && Array.isArray(locJson.data)) {
                      for (const loc of locJson.data) serviceLocMap.set(loc.id, loc);
                    }
                  })
              );
            }
            if (resolve_equipment) {
              tasks.push(
                fetchWithTimeout(`${base}/api/v1/customers/equipments`, postOpts(), CUSTOMER_TIMEOUT_MS)
                  .then((r) => r.json()).catch(() => ({}))
                  .then((eqJson) => {
                    equipmentMap.set(
                      customerId,
                      Number(eqJson.code) === 200 && Array.isArray(eqJson.data) ? eqJson.data : []
                    );
                  })
              );
            }
            await Promise.all(tasks);
          })
        );

        processed = Math.min(processed + chunk.length, total);
        log(`  chunk done: ${processed}/${total} (${Date.now() - chunkStart}ms)`);
        send({ type: 'progress', phase: 'customers', current: processed, total });
      }

      jobs = jobs.map((job) => {
        const enriched = { ...job };
        if (resolve_service_locations) {
          enriched.service_location =
            job.customer_service_location_id != null
              ? (serviceLocMap.get(job.customer_service_location_id) ?? null)
              : null;
        }
        if (resolve_equipment) {
          enriched.customer_equipments =
            job.id_customer != null ? (equipmentMap.get(job.id_customer) ?? []) : [];
        }
        return enriched;
      });

      meta.resolve_service_locations = resolve_service_locations;
      meta.resolve_equipment = resolve_equipment;
      meta.unique_customers_fetched = total;
      meta.service_location_ms = Date.now() - t1;
      if (resolve_service_locations) {
        meta.service_locations_found = jobs.filter((j) => j.service_location != null).length;
      }
      if (resolve_equipment) {
        meta.equipment_rows = jobs.reduce((s, j) => s + (j.customer_equipments?.length ?? 0), 0);
      }
    }

    // ── Cache result, send token — keeps SSE payload tiny ─────────────────
    const token = storeResult({ success: true, jobs, meta, raw: jobsJson });
    log(`✓ DONE — storing result, token=${token}, jobs=${jobs.length}`);
    send({ type: 'step', phase: 'saving', message: 'Preparing results…' });
    send({ type: 'done', token });
    res.end();
  } catch (e) {
    log('✗ FATAL error:', e.message, e.stack?.split('\n')[1]);
    send({ type: 'error', error: e?.message || 'AIFM request failed' });
    res.end();
  }
}
