#!/usr/bin/env node
/**
 * Backfill public.contacts for AIFM jobs from Supabase masterlist (sap_lead_contact / customer contacts).
 *
 *   pnpm aifm:repair-contacts -- --start=2026-05-01 --end=2026-05-31
 *   pnpm aifm:repair-contacts -- --job=2026-001138
 *   pnpm aifm:repair-contacts -- --dry-run
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = {
    dryRun: false,
    start: '2026-05-01',
    end: '2026-05-31',
    job: [],
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a.startsWith('--start=')) out.start = a.slice(8).trim();
    if (a.startsWith('--end=')) out.end = a.slice(6).trim();
    if (a.startsWith('--job=')) {
      out.job = a
        .slice(6)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
  }
  return out;
}

async function fetchJobs(supabase, args) {
  if (args.job.length) {
    const rows = [];
    for (const jn of args.job) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, customer_id, location_id, description, scheduled_start')
        .eq('job_number', jn)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (data) rows.push(data);
    }
    return rows;
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_number, customer_id, location_id, description, scheduled_start')
    .is('deleted_at', null)
    .not('customer_id', 'is', null)
    .ilike('description', '%[AIFM:%')
    .gte('scheduled_start', `${args.start}T00:00:00`)
    .lte('scheduled_start', `${args.end}T23:59:59`)
    .order('scheduled_start', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadAifmJobsById(auth, start, end, aifmIds) {
  const byId = new Map();
  for (let page = 1; page <= 200; page++) {
    const res = await fetch(`${auth.base}/api/v1/jobs`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: auth.bearer,
        start_date: start,
        end_date: end,
        page,
        per_page: 50,
      }),
    });
    const json = await res.json();
    for (const row of json.data || []) {
      if (aifmIds.has(String(row.id))) byId.set(String(row.id), row);
    }
    if ((json.data || []).length < 50) break;
    if (byId.size >= aifmIds.size) break;
  }
  return byId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { syncPortalContactsFromMasterlist } = await import(
    '../lib/customers/syncPortalContactsFromMasterlist.js'
  );

  let jobs = await fetchJobs(supabase, args);
  if (args.limit) jobs = jobs.slice(0, args.limit);

  if (!jobs.length) {
    console.log('No matching AIFM jobs.');
    return;
  }

  const aifmIds = new Set();
  const aifmIdByJobId = new Map();
  for (const j of jobs) {
    const m = j.description?.match(/\[AIFM:(\d+)\]/);
    if (m) {
      aifmIds.add(m[1]);
      aifmIdByJobId.set(j.id, m[1]);
    }
  }

  let aifmById = new Map();
  if (token && aifmIds.size) {
    const { authorizeAifmBearer } = await import('../lib/integrations/aifmApiClient.js');
    const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, token);
    if (auth) {
      aifmById = await loadAifmJobsById(auth, args.start, args.end, aifmIds);
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let processed = 0;

  for (const job of jobs) {
    processed++;
    const aifmId = aifmIdByJobId.get(job.id);
    const aifmJob = aifmId ? aifmById.get(aifmId) : null;

    let locationName = null;
    if (job.location_id) {
      const { data: loc } = await supabase
        .from('locations')
        .select('location_name')
        .eq('id', job.location_id)
        .maybeSingle();
      locationName = loc?.location_name || null;
    }

    if (args.dryRun) {
      const { count } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', job.customer_id);
      console.log(
        `[dry-run] ${job.job_number} customer=${job.customer_id} contacts=${count ?? 0} aifm=${aifmId || '—'}`
      );
      continue;
    }

    try {
      const r = await syncPortalContactsFromMasterlist(supabase, {
        customerId: job.customer_id,
        locationId: job.location_id,
        locationName,
        aifmJob,
      });
      inserted += r.inserted || 0;
      updated += r.updated || 0;
      skipped += r.skipped || 0;
      if ((r.inserted || 0) + (r.updated || 0) > 0) {
        console.log(
          `✓ ${job.job_number} +${r.inserted || 0} ins / ${r.updated || 0} upd (had=${r.hadContacts})`
        );
      }
    } catch (e) {
      console.warn(`✗ ${job.job_number}: ${e?.message || e}`);
    }
  }

  console.log(
    `\nDone. jobs=${processed} contact_ins=${inserted} contact_upd=${updated} skipped=${skipped}${args.dryRun ? ' (dry-run)' : ''}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
