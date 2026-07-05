#!/usr/bin/env node
/**
 * Backfill service_call + sales_order links for AIFM-imported jobs.
 *
 *   node scripts/backfill-aifm-service-call-so.mjs --start=2026-05-01 --end=2026-05-31
 *   node scripts/backfill-aifm-service-call-so.mjs --aifm=219376,219370
 *   node scripts/backfill-aifm-service-call-so.mjs --job=2026-001071 --dry-run
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

function parseArgs(argv) {
  const out = {
    aifm: [],
    job: [],
    start: '2026-05-01',
    end: '2026-05-31',
    dryRun: false,
    limit: 0,
  };
  for (const a of argv) {
    if (a === '--dry-run' || a === '--dryrun' || a === '-n') out.dryRun = true;
    if (a.startsWith('--aifm=')) out.aifm = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    if (a.startsWith('--job=')) out.job = a.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
    if (a.startsWith('--start=')) out.start = a.slice(8).trim();
    if (a.startsWith('--end=')) out.end = a.slice(6).trim();
    if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10) || 0;
  }
  return out;
}

async function loadPortalJobs(supabase, { aifmIds, jobNumbers, limit }) {
  if (jobNumbers.length) {
    const rows = [];
    for (const jn of jobNumbers) {
      const { data } = await supabase
        .from('jobs')
        .select('id, job_number, title, description, customer_id, service_call_id, sales_order_id')
        .eq('job_number', jn)
        .is('deleted_at', null)
        .maybeSingle();
      if (data) rows.push(data);
    }
    return rows;
  }

  let q = supabase
    .from('jobs')
    .select('id, job_number, title, description, customer_id, service_call_id, sales_order_id')
    .ilike('description', '%[AIFM:%')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (aifmIds.length) {
    const filters = aifmIds.map((id) => `description.ilike.%[AIFM:${id}]%`);
    q = q.or(filters.join(','));
  }

  if (limit > 0) q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.dryRun) {
    console.log('DRY RUN — AIFM fetch runs; Supabase service_call / sales_order links are not written.\n');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const {
    extractAifmIdFromDescription,
    extractAifmPoFromDescription,
    applyAifmSapIdentifiers,
  } = await import('../lib/integrations/aifmSapIdentifiers.js');

  let targetAifmIds = [...args.aifm];
  const portalJobs = await loadPortalJobs(supabase, {
    aifmIds: targetAifmIds,
    jobNumbers: args.job,
    limit: args.limit,
  });

  if (!portalJobs.length) {
    console.error('No matching portal jobs found');
    process.exit(1);
  }

  for (const row of portalJobs) {
    const id = extractAifmIdFromDescription(row.description);
    if (id) targetAifmIds.push(id);
  }
  targetAifmIds = [...new Set(targetAifmIds)];

  const aifmById = new Map();
  if (token && targetAifmIds.length) {
    const { authorizeAifmBearer, fetchAllAifmJobsInRange } = await import(
      '../lib/integrations/aifmApiClient.js'
    );
    const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, token);
    if (auth) {
      const { jobs } = await fetchAllAifmJobsInRange(auth.base, auth.bearer, args.start, args.end);
      for (const j of jobs) {
        aifmById.set(String(j.id), j);
      }
      console.log(`AIFM index: ${aifmById.size} jobs in ${args.start} → ${args.end}`);
    } else {
      console.warn('AIFM auth failed — PO/service call from description only where possible');
    }
  }

  const stats = { linked: 0, skipped: 0, noCustomer: 0, failed: 0, dryRun: args.dryRun };

  for (const portalJob of portalJobs) {
    const aifmId = extractAifmIdFromDescription(portalJob.description);
    const apiRow = aifmId ? aifmById.get(String(aifmId)) : null;

    const personalJobId =
      apiRow?.personal_job_id ?? apiRow?.personal_id ?? null;
    const poNumber =
      apiRow?.job_po_number ?? extractAifmPoFromDescription(portalJob.description);

    if (!personalJobId && !poNumber) {
      stats.skipped++;
      console.log(`— ${portalJob.job_number}: no personal_job_id or PO`);
      continue;
    }

    if (!portalJob.customer_id && personalJobId) {
      stats.noCustomer++;
      console.log(`⚠ ${portalJob.job_number}: service_call needs customer_id (run assign-customers)`);
      if (!poNumber) continue;
    }

    console.log(
      `${args.dryRun ? '[dry-run] ' : ''}${portalJob.job_number} (AIFM ${aifmId || '?'}) SC=${personalJobId || '—'} SO=${poNumber || '—'}`
    );

    if (args.dryRun) {
      stats.linked++;
      if (personalJobId && portalJob.customer_id) {
        console.log(`  → would upsert service_call call_number=${personalJobId}`);
      }
      if (poNumber) {
        console.log(`  → would upsert sales_order document_number=${poNumber}`);
      }
      continue;
    }

    try {
      const result = await applyAifmSapIdentifiers({
        supabase,
        jobId: portalJob.id,
        customerId: portalJob.customer_id,
        personalJobId,
        poNumber,
        jobTitle: portalJob.title,
      });
      if (result.skipped) stats.skipped++;
      else stats.linked++;
    } catch (e) {
      stats.failed++;
      console.error(`  ✗ ${portalJob.job_number}:`, e.message);
    }
  }

  console.log('\nSummary:', stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
