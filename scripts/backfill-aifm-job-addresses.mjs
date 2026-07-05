#!/usr/bin/env node
/**
 * Backfill job addresses for AIFM-imported portal jobs.
 *
 * Pass 1 — [ADDRESS:…] tags → job_schedule.address (+ location link)
 * Pass 2 — locations.location_name → job_schedule when tag missing
 * Pass 3 — AIFM API → location + job_schedule for jobs with customer but no location_id
 *
 * Usage (from repo root):
 *   pnpm run aifm:backfill-addresses
 *   pnpm run aifm:backfill-addresses:dry
 *   node scripts/backfill-aifm-job-addresses.mjs --job=2026-004227,2026-004228
 *   node scripts/backfill-aifm-job-addresses.mjs --customer=C000639
 *   node scripts/backfill-aifm-job-addresses.mjs --limit=50000
 *
 * Diagnose one job (no writes):
 *   pnpm run test:aifm-location -- --job-number=2026-004227
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Pass 3 also needs: AIFM_API_TOKEN (and optional AIFM_BASE_URL)
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = {
    job: [],
    customer: null,
    limit: 50000,
    dryRun: false,
  };
  for (const a of argv) {
    if (a === '--dry-run' || a === '--dryrun' || a === '-n') out.dryRun = true;
    if (a.startsWith('--job=')) {
      out.job = a.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (a.startsWith('--customer=')) out.customer = a.slice(11).trim() || null;
    if (a.startsWith('--limit=')) out.limit = Math.min(200000, Math.max(1, parseInt(a.slice(8), 10) || 50000));
  }
  return out;
}

function extractTag(description, tag) {
  if (!description) return null;
  const m = description.match(new RegExp(`\\[${tag}:([^\\]]+)\\]`));
  return m ? m[1].trim() : null;
}

async function resolveLocation(customerId, locationName, supabase) {
  if (!customerId || !locationName) return null;

  const { data: owned } = await supabase
    .from('locations')
    .select('id, location_name')
    .eq('customer_id', customerId)
    .eq('location_name', locationName)
    .is('deleted_at', null)
    .maybeSingle();
  if (owned) return owned;

  const { data: placeholder } = await supabase
    .from('locations')
    .select('id, location_name')
    .is('customer_id', null)
    .eq('location_name', locationName)
    .is('deleted_at', null)
    .maybeSingle();

  if (placeholder) {
    const { data: claimed } = await supabase
      .from('locations')
      .update({ customer_id: customerId })
      .eq('id', placeholder.id)
      .select('id, location_name')
      .single();
    return claimed || placeholder;
  }

  const { data: created, error } = await supabase
    .from('locations')
    .insert({ customer_id: customerId, location_name: locationName })
    .select('id, location_name')
    .single();

  if (error) {
    console.warn(`[resolveLocation] insert failed: ${error.message}`);
    return null;
  }
  return created;
}

async function upsertScheduleAddress(supabase, jobId, address, dryRun) {
  const normalized = String(address || '').trim();
  if (!normalized) return false;

  const { data: sched } = await supabase
    .from('job_schedule')
    .select('id, address')
    .eq('job_id', jobId)
    .limit(1)
    .maybeSingle();

  if ((sched?.address || '').trim()) return false;

  if (dryRun) return true;

  if (sched?.id) {
    await supabase.from('job_schedule').update({ address: normalized }).eq('id', sched.id);
  } else {
    await supabase.from('job_schedule').insert({ job_id: jobId, address: normalized });
  }
  return true;
}

async function fetchPagedJobs(supabase, buildQuery, maxTotal) {
  const PAGE = 1000;
  const cap = Math.max(1, Math.min(maxTotal, 200000));
  const all = [];
  let from = 0;

  for (;;) {
    if (all.length >= cap) break;
    const need = Math.min(PAGE, cap - all.length);
    const to = from + need - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < need) break;
    from += need;
  }

  return all;
}

async function runAddressTagPass(supabase, maxJobs, log, dryRun) {
  const jobs = await fetchPagedJobs(
    supabase,
    (from, to) =>
      supabase
        .from('jobs')
        .select('id, job_number, description, customer_id, location_id')
        .is('deleted_at', null)
        .ilike('description', '%[AIFM:%')
        .ilike('description', '%[ADDRESS:%')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    maxJobs
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    const normalized = (extractTag(job.description, 'ADDRESS') || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      skipped++;
      continue;
    }

    try {
      const { data: sched } = await supabase
        .from('job_schedule')
        .select('id, address')
        .eq('job_id', job.id)
        .limit(1)
        .maybeSingle();

      if ((sched?.address || '').trim()) {
        skipped++;
        continue;
      }

      if (dryRun) {
        updated++;
        log(`[dry-run] ✓ ${job.job_number} ← [ADDRESS] tag`);
        continue;
      }

      if (sched?.id) {
        await supabase.from('job_schedule').update({ address: normalized }).eq('id', sched.id);
      } else {
        await supabase.from('job_schedule').insert({ job_id: job.id, address: normalized });
      }

      if (job.customer_id) {
        const location = await resolveLocation(job.customer_id, normalized, supabase);
        if (location) {
          await supabase
            .from('jobs')
            .update({ location_id: location.id, updated_at: new Date().toISOString() })
            .eq('id', job.id);
        }
      }

      updated++;
      log(`✓ ${job.job_number} ← [ADDRESS] tag`);
    } catch (err) {
      failed++;
      log(`✗ ${job.job_number} tag pass: ${err.message}`);
    }
  }

  return { updated, skipped, failed, total: jobs.length };
}

async function runLocationNamePass(supabase, maxJobs, log, dryRun) {
  const jobs = await fetchPagedJobs(
    supabase,
    (from, to) =>
      supabase
        .from('jobs')
        .select('id, job_number, location_id')
        .is('deleted_at', null)
        .not('location_id', 'is', null)
        .ilike('description', '%[AIFM:%')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    maxJobs
  );

  let updated = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const { data: sched } = await supabase
        .from('job_schedule')
        .select('id, address')
        .eq('job_id', job.id)
        .limit(1)
        .maybeSingle();

      if (!sched?.id || (sched.address || '').trim()) continue;

      const { data: loc } = await supabase
        .from('locations')
        .select('location_name')
        .eq('id', job.location_id)
        .maybeSingle();

      const name = (loc?.location_name || '').trim();
      if (!name) continue;

      if (dryRun) {
        updated++;
        log(`[dry-run] ✓ ${job.job_number} ← location_name`);
        continue;
      }

      await supabase.from('job_schedule').update({ address: name }).eq('id', sched.id);
      updated++;
      log(`✓ ${job.job_number} ← location_name`);
    } catch (err) {
      failed++;
      log(`✗ ${job.job_number} location pass: ${err.message}`);
    }
  }

  return { updated, failed, total: jobs.length };
}

async function runAifmApiPass(supabase, maxJobs, log, dryRun) {
  const { getServiceAddressFromAifmJobDescription } = await import(
    '../lib/integrations/aifmJobLocationFromApi.js'
  );

  const PAGE = 500;
  const all = [];
  let from = 0;

  for (;;) {
    if (all.length >= maxJobs) break;
    const need = Math.min(PAGE, maxJobs - all.length);
    const to = from + need - 1;

    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, description, customer_id, location_id, scheduled_start')
      .not('customer_id', 'is', null)
      .is('location_id', null)
      .ilike('description', '%[AIFM:%')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < need) break;
    from += need;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of all) {
    try {
      const addr = await getServiceAddressFromAifmJobDescription(job.description, job.scheduled_start);
      if (!addr) {
        skipped++;
        continue;
      }

      if (dryRun) {
        updated++;
        log(`[dry-run] ✓ ${job.job_number} ← AIFM API`);
        continue;
      }

      const location = await resolveLocation(job.customer_id, addr, supabase);
      if (!location) {
        skipped++;
        continue;
      }

      await supabase
        .from('jobs')
        .update({ location_id: location.id, updated_at: new Date().toISOString() })
        .eq('id', job.id);

      await upsertScheduleAddress(supabase, job.id, addr, false);
      updated++;
      log(`✓ ${job.job_number} ← AIFM API`);
    } catch (err) {
      failed++;
      log(`✗ ${job.job_number} AIFM pass: ${err.message}`);
    }
  }

  return { updated, skipped, failed, total: all.length };
}

async function loadTargetJobs(supabase, { jobNumbers, customerCode }) {
  if (jobNumbers.length) {
    const rows = [];
    for (const jn of jobNumbers) {
      const { data } = await supabase
        .from('jobs')
        .select('id, job_number, description, customer_id, location_id, scheduled_start')
        .eq('job_number', jn)
        .is('deleted_at', null)
        .maybeSingle();
      if (data) rows.push(data);
    }
    return rows;
  }

  if (customerCode) {
    const { data: cust } = await supabase
      .from('customer')
      .select('id, customer_code')
      .ilike('customer_code', customerCode)
      .is('deleted_at', null)
      .maybeSingle();

    if (!cust?.id) {
      console.error(`Customer not found: ${customerCode}`);
      process.exit(1);
    }

    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, description, customer_id, location_id, scheduled_start')
      .eq('customer_id', cust.id)
      .ilike('description', '%[AIFM:%')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  }

  return null;
}

async function backfillJobsFromAifmApi(supabase, jobs, { dryRun, log }) {
  const { getServiceAddressFromAifmJobDescription } = await import(
    '../lib/integrations/aifmJobLocationFromApi.js'
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const { data: sched } = await supabase
        .from('job_schedule')
        .select('address')
        .eq('job_id', job.id)
        .limit(1)
        .maybeSingle();

      const tagAddr = (extractTag(job.description, 'ADDRESS') || '').replace(/\s+/g, ' ').trim();
      const existing = tagAddr || (sched?.address || '').trim();
      if (existing) {
        skipped++;
        log(`↷ ${job.job_number} — already has address`);
        continue;
      }

      if (!/\[AIFM:[^\]]+\]/.test(job.description || '')) {
        skipped++;
        log(`↷ ${job.job_number} — no [AIFM:] tag`);
        continue;
      }

      const addr = await getServiceAddressFromAifmJobDescription(job.description, job.scheduled_start);
      if (!addr) {
        skipped++;
        log(`↷ ${job.job_number} — AIFM returned no address`);
        continue;
      }

      if (dryRun) {
        updated++;
        log(`[dry-run] ✓ ${job.job_number} → ${addr.slice(0, 80)}${addr.length > 80 ? '…' : ''}`);
        continue;
      }

      await upsertScheduleAddress(supabase, job.id, addr, false);

      if (job.customer_id) {
        const location = await resolveLocation(job.customer_id, addr, supabase);
        if (location?.id && !job.location_id) {
          await supabase
            .from('jobs')
            .update({ location_id: location.id, updated_at: new Date().toISOString() })
            .eq('id', job.id);
        }
      }

      updated++;
      log(`✓ ${job.job_number} → ${addr.slice(0, 80)}${addr.length > 80 ? '…' : ''}`);
    } catch (err) {
      failed++;
      log(`✗ ${job.job_number} ${err.message}`);
    }
  }

  return { updated, skipped, failed, total: jobs.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(process.env.AIFM_API_TOKEN || '').trim();

  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const log = (...parts) => console.log('[aifm:backfill-addresses]', ...parts);

  if (args.dryRun) log('DRY RUN — no database writes');

  const targetedJobs = await loadTargetJobs(supabase, {
    jobNumbers: args.job,
    customerCode: args.customer,
  });

  if (targetedJobs) {
    log(`Targeted mode: ${targetedJobs.length} job(s)`);
    if (!token) console.warn('Warning: AIFM_API_TOKEN not set — AIFM API lookups will fail');
    const summary = await backfillJobsFromAifmApi(supabase, targetedJobs, { dryRun: args.dryRun, log });
    log('Done.', JSON.stringify(summary));
    process.exit(summary.failed > 0 ? 1 : 0);
  }

  if (!token) {
    console.warn('Warning: AIFM_API_TOKEN not set — pass 3 (AIFM API) will skip all jobs');
  }

  log(`Pass 1: [ADDRESS] tags (limit ${args.limit})…`);
  const tagPass = await runAddressTagPass(supabase, args.limit, log, args.dryRun);
  log('Pass 1 summary:', JSON.stringify(tagPass));

  log(`Pass 2: location_name → schedule (limit ${args.limit})…`);
  const locPass = await runLocationNamePass(supabase, args.limit, log, args.dryRun);
  log('Pass 2 summary:', JSON.stringify(locPass));

  log(`Pass 3: AIFM API (limit ${args.limit})…`);
  const aifmPass = await runAifmApiPass(supabase, args.limit, log, args.dryRun);
  log('Pass 3 summary:', JSON.stringify(aifmPass));

  log('Done.');
  const totalFailed = tagPass.failed + locPass.failed + aifmPass.failed;
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[aifm:backfill-addresses] FATAL:', err);
  process.exit(1);
});
