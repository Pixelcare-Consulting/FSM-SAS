/**
 * Diagnose AIFM → portal location resolution using real env + Supabase data (no hardcoded jobs).
 *
 * Reads the same jobs as runAifmLinkedJobsLocationEnrichmentPass (customer set, no location, [AIFM:…]),
 * then for each row shows: extracted AIFM id, token/auth/scan outcome, raw service_location, formatted string.
 *
 * Usage (from repo root):
 *   pnpm exec node scripts/test-aifm-job-location.mjs
 *   pnpm exec node scripts/test-aifm-job-location.mjs --limit=5
 *   pnpm exec node scripts/test-aifm-job-location.mjs --job-number=2026-000700
 *   pnpm exec node scripts/test-aifm-job-location.mjs --raw
 *
 * Without Supabase (AIFM only):
 *   pnpm exec node scripts/test-aifm-job-location.mjs --aifm-id=219820 --scheduled=2026-05-02T16:00:00+00:00 --raw
 *
 * Dump one page of raw list API (see real field names on jobs[]):
 *   pnpm exec node scripts/test-aifm-job-location.mjs --list-sample
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (DB modes only)
 * Optional: AIFM_API_TOKEN, AIFM_BASE_URL (always for API calls)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

import {
  authorizeAifmBearer,
  scanAifmJobsForId,
  aifmWideDateRange,
  aifmTightRangeAroundScheduled,
  fetchAifmJobsListPageRaw,
  fetchAifmServiceLocationRow,
} from '../lib/integrations/aifmApiClient.js';
import { formatAifmLocation } from '../lib/utils/aifmLocationFormat.js';
import { getServiceAddressFromAifmJobDescription } from '../lib/integrations/aifmJobLocationFromApi.js';

function parseArgs(argv) {
  const out = {
    limit: 10,
    jobNumber: null,
    raw: false,
    aifmId: null,
    scheduled: null,
    listSample: false,
  };
  for (const a of argv) {
    if (a === '--' || a === '') continue;
    if (a === '--raw') {
      out.raw = true;
      continue;
    }
    if (a.startsWith('--limit=')) out.limit = Math.min(100, Math.max(1, parseInt(a.slice(8), 10) || 10));
    if (a.startsWith('--job-number=')) out.jobNumber = a.slice(13).trim() || null;
    if (a.startsWith('--aifm-id=')) out.aifmId = a.slice(10).trim() || null;
    if (a.startsWith('--scheduled=')) out.scheduled = a.slice(12).trim() || null;
    if (a === '--list-sample') out.listSample = true;
  }
  return out;
}

function extractAifmId(description) {
  const m = String(description || '').match(/\[AIFM:([^\]]+)\]/);
  return m ? m[1].trim() : '';
}

/**
 * Same resolution path as production, with explicit reasons when it fails.
 * When a list row is found, `aifmPayload` is the raw job object from AIFM `data[]`.
 */
async function diagnoseRow({ aifmId, scheduledIso }) {
  const steps = [];
  if (!aifmId) {
    return { ok: false, reason: 'no_[AIFM:_tag_in_description', steps, aifmPayload: null };
  }

  const apiToken = (process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!apiToken) {
    return { ok: false, reason: 'missing_AIFM_API_TOKEN', steps, aifmPayload: null };
  }
  steps.push('env_token_present');

  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, apiToken);
  if (!auth) {
    return { ok: false, reason: 'AIFM_authorize_failed_check_token_and_AIFM_BASE_URL', steps, aifmPayload: null };
  }
  steps.push('authorize_ok');

  const { base, bearer } = auth;
  const ranges = [];
  const tight = aifmTightRangeAroundScheduled(scheduledIso);
  if (tight) ranges.push({ label: 'tight_±21d_around_scheduled_start', ...tight });
  ranges.push({ label: 'wide_~2y_back_1y_forward', ...aifmWideDateRange() });

  for (const r of ranges) {
    const hit = await scanAifmJobsForId(base, bearer, aifmId, r);
    if (hit) {
      let formatted = formatAifmLocation(hit);
      let rawLoc = hit?.service_location ?? null;
      let via = 'jobs_list_inline_service_location';
      if (!formatted && hit.id_customer != null && hit.customer_service_location_id != null) {
        const locRow = await fetchAifmServiceLocationRow(base, bearer, hit.id_customer, hit.customer_service_location_id);
        if (locRow) {
          formatted = formatAifmLocation({ service_location: locRow });
          rawLoc = locRow;
          via = 'POST_/customers/service_locations_by_id';
        }
      }
      if (!formatted) {
        return {
          ok: false,
          reason: 'payload_found_but_no_address_inline_or_via_service_location_id',
          range: r.label,
          payloadId: hit.id,
          rawServiceLocation: rawLoc,
          steps: [...steps, `hit_range:${r.label}`],
          aifmPayload: hit,
        };
      }
      return {
        ok: true,
        range: r.label,
        payloadId: hit.id,
        rawServiceLocation: rawLoc,
        formattedAddress: formatted,
        via,
        steps: [...steps, `hit_range:${r.label}`, via],
        aifmPayload: hit,
      };
    }
    steps.push(`scan_no_hit:${r.label}`);
  }

  return {
    ok: false,
    reason: 'job_id_not_returned_by_/api/v1/jobs_in_scanned_pages_(wrong_dates_or_id_mismatch)',
    steps,
    aifmPayload: null,
  };
}

function printPayloadSummary(hit) {
  if (!hit || typeof hit !== 'object') return;
  console.log(`  AIFM payload top-level keys: ${Object.keys(hit).join(', ')}`);
  const locish = [
    'service_location',
    'location',
    'address',
    'site',
    'customer',
    'customer_address',
    'job_address',
    'service_address',
  ];
  for (const k of locish) {
    if (hit[k] !== undefined && hit[k] !== null) {
      console.log(`  AIFM payload.${k}: ${JSON.stringify(hit[k])}`);
    }
  }
}

function printDiagnosisBlock({ jobLabel, jobRef, scheduledIso, aifmId, descriptionPreview, descLen }) {
  console.log(jobLabel);
  if (scheduledIso !== undefined) console.log(`  scheduled_start: ${scheduledIso ?? '(null)'}`);
  if (aifmId !== undefined) console.log(`  [AIFM:] id: ${aifmId || '(missing)'}`);
  if (descriptionPreview !== undefined) {
    const len = typeof descLen === 'number' ? descLen : descriptionPreview.length;
    console.log(`  description preview: ${descriptionPreview}${len > 160 ? '…' : ''}`);
  }
  if (jobRef) console.log(`  portal job_number: ${jobRef}`);
}

async function runListSample() {
  const apiToken = (process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!apiToken) {
    console.error('Set AIFM_API_TOKEN in .env.local');
    process.exit(1);
  }
  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, apiToken);
  if (!auth) {
    console.error('AIFM authorize failed (check AIFM_API_TOKEN and AIFM_BASE_URL)');
    process.exit(1);
  }
  const range = aifmWideDateRange();
  console.log(
    `POST ${auth.base}/api/v1/jobs — page 1, start_date=${range.start_date} end_date=${range.end_date}\n`
  );
  const json = await fetchAifmJobsListPageRaw(auth.base, auth.bearer, range.start_date, range.end_date, 1);
  if (!json) {
    console.error('No JSON (non-200 or empty body).');
    process.exit(1);
  }
  console.log('--- Full API envelope (code, message, data, …) ---');
  console.log(JSON.stringify(json, null, 2));
  const rows = Array.isArray(json?.data) ? json.data : [];
  console.log(`\n--- Summary: ${rows.length} job(s) on page 1 ---`);
  if (rows[0]) {
    console.log('First job top-level keys:', Object.keys(rows[0]).join(', '));
  }
}

async function runAifmOnlyProbe({ aifmId, scheduled, raw }) {
  const d = await diagnoseRow({ aifmId, scheduledIso: scheduled });
  printDiagnosisBlock({
    jobLabel: `AIFM id ${aifmId}`,
    jobRef: null,
    scheduledIso: scheduled,
    aifmId,
    descriptionPreview: undefined,
  });
  if (d.ok) {
    console.log(`  result: OK via ${d.range} (${d.via || 'inline'})`);
    console.log(`  formatted address: ${d.formattedAddress}`);
    console.log(`  raw service_location: ${JSON.stringify(d.rawServiceLocation)}`);
  } else {
    console.log(`  result: FAIL — ${d.reason}`);
    if (d.rawServiceLocation !== undefined) {
      console.log(`  raw service_location: ${JSON.stringify(d.rawServiceLocation)}`);
    }
  }
  console.log(`  steps: ${(d.steps || []).join(' → ')}`);
  if (d.aifmPayload) {
    printPayloadSummary(d.aifmPayload);
    if (raw) {
      console.log('  --- AIFM raw job object (full JSON) ---');
      console.log(JSON.stringify(d.aifmPayload, null, 2));
    }
  }
  const prod = await getServiceAddressFromAifmJobDescription(`[AIFM:${aifmId}]`, scheduled);
  console.log(`  getServiceAddressFromAifmJobDescription (prod): ${prod ?? '(null)'}`);
}

async function main() {
  const { limit, jobNumber, raw, aifmId, scheduled, listSample } = parseArgs(process.argv.slice(2));

  if (listSample) {
    await runListSample();
    return;
  }

  if (aifmId) {
    await runAifmOnlyProbe({ aifmId, scheduled, raw });
    console.log(
      '\nNote: Use --list-sample to see the full POST /api/v1/jobs response shape; use --raw for full JSON of one matched job.'
    );
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).');
    console.error('Or use --aifm-id=<id> [--scheduled=ISO] to test without DB.');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let q = supabase
    .from('jobs')
    .select('id, job_number, description, customer_id, location_id, scheduled_start, updated_at')
    .not('customer_id', 'is', null)
    .is('location_id', null)
    .ilike('description', '%[AIFM:%')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (jobNumber) {
    q = q.eq('job_number', jobNumber);
  }

  const { data: rows, error } = await q;
  if (error) {
    console.error('Supabase query failed:', error.message);
    process.exit(1);
  }

  if (!rows?.length) {
    console.log(
      'No matching rows (customer set, location null, description contains [AIFM:…]). Try without --job-number or sync data first.'
    );
    return;
  }

  console.log(`Loaded ${rows.length} job(s) from DB (limit=${limit}${jobNumber ? `, job_number=${jobNumber}` : ''}).\n`);
  console.log('---');
  for (const job of rows) {
    const aifmIdFromDesc = extractAifmId(job.description);
    const descPreview = String(job.description || '').replace(/\s+/g, ' ').slice(0, 160);
    printDiagnosisBlock({
      jobLabel: `Job ${job.job_number}`,
      jobRef: job.job_number,
      scheduledIso: job.scheduled_start,
      aifmId: aifmIdFromDesc,
      descriptionPreview: descPreview,
      descLen: (job.description || '').length,
    });

    const d = await diagnoseRow({ aifmId: aifmIdFromDesc, scheduledIso: job.scheduled_start });
    if (d.ok) {
      console.log(`  result: OK via ${d.range} (${d.via || 'inline'})`);
      console.log(`  formatted address: ${d.formattedAddress}`);
      console.log(`  raw service_location: ${JSON.stringify(d.rawServiceLocation)}`);
    } else {
      console.log(`  result: FAIL — ${d.reason}`);
      if (d.rawServiceLocation !== undefined) {
        console.log(`  raw service_location: ${JSON.stringify(d.rawServiceLocation)}`);
      }
    }
    console.log(`  steps: ${(d.steps || []).join(' → ')}`);
    if (d.aifmPayload) {
      printPayloadSummary(d.aifmPayload);
      if (raw) {
        console.log('  --- AIFM raw job object (full JSON) ---');
        console.log(JSON.stringify(d.aifmPayload, null, 2));
      }
    }
    const prod = await getServiceAddressFromAifmJobDescription(job.description, job.scheduled_start);
    console.log(`  getServiceAddressFromAifmJobDescription (prod): ${prod ?? '(null)'}`);
    console.log('---');
  }

  console.log(
    '\nTip: --raw prints full AIFM job JSON when a list row matches. --list-sample dumps page 1 of /api/v1/jobs. --aifm-id=… skips DB.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
