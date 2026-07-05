#!/usr/bin/env node
/**
 * Fix FSM appointment windows from AIFM job_start/end (24h) — not estimated_duration only.
 *
 * Example: AIFM 16:00–18:00 must be 4pm–6pm on the portal, not 4pm–5pm when estimated_duration_hrs=1.
 *
 *   node scripts/repair-aifm-job-times.mjs --job=2026-001138
 *   node scripts/repair-aifm-job-times.mjs --aifm=235797,235912
 *   node scripts/repair-aifm-job-times.mjs --start=2026-05-01 --end=2026-05-31
 *   node scripts/repair-aifm-job-times.mjs --start=2026-05-01 --end=2026-05-31 --dry-run
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = {
    aifm: [],
    job: [],
    start: null,
    end: null,
    dryRun: false,
    allInRange: false,
  };
  for (const a of argv) {
    if (a.startsWith('--aifm=')) {
      out.aifm.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith('--job=')) {
      out.job.push(...a.slice(6).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith('--start=')) out.start = a.slice(8).trim();
    else if (a.startsWith('--end=')) out.end = a.slice(6).trim();
    else if (a === '--dry-run') out.dryRun = true;
  }
  if (out.start && out.end) out.allInRange = true;
  return out;
}

function timeFromIso(iso) {
  if (!iso) return null;
  return (iso.split('T')[1] || '').split('.')[0] || null;
}

function dateFromIso(iso) {
  if (!iso) return null;
  return iso.split('T')[0] || null;
}

/** True when AIFM sent an explicit appointment end (job_end_date/time). */
function aifmHasAppointmentEnd(job) {
  return Boolean(String(job?.job_end_date || '').trim() && String(job?.job_end_time || '').trim());
}

function formatSlot(job) {
  const s = [job?.job_start_date, job?.job_start_time].filter(Boolean).join(' ');
  const e = [job?.job_end_date, job?.job_end_time].filter(Boolean).join(' ');
  return `${s} → ${e}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!url || !key || !token) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AIFM_API_TOKEN');
    process.exit(1);
  }

  if (!args.allInRange && !args.aifm.length && !args.job.length) {
    console.error(
      'Usage:\n' +
        '  --job=2026-001138\n' +
        '  --aifm=235797\n' +
        '  --start=2026-05-01 --end=2026-05-31'
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { authorizeAifmBearer, fetchAllAifmJobsInRange } = await import(
    '../lib/integrations/aifmApiClient.js'
  );
  const {
    parseAifmDateTime,
    computeAifmWorkEndIso,
    aifmDurationDecimalHours,
  } = await import('../lib/utils/aifmJobScheduleTimes.js');

  const sameInstant = (a, b) => {
    if (!a || !b) return !a && !b;
    return new Date(a).getTime() === new Date(b).getTime();
  };

  let targetAifmIds = new Set(args.aifm);

  for (const jn of args.job) {
    const { data } = await supabase
      .from('jobs')
      .select('job_number, description')
      .eq('job_number', jn)
      .is('deleted_at', null)
      .maybeSingle();
    const m = data?.description?.match(/\[AIFM:(\d+)\]/);
    if (m) targetAifmIds.add(m[1]);
    else console.warn(`No [AIFM:id] on job ${jn}`);
  }

  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, token);
  if (!auth) {
    console.error('AIFM authorize failed');
    process.exit(1);
  }

  let aifmJobs = [];
  const start_date = args.start || '2026-05-01';
  const end_date = args.end || '2026-05-31';

  if (args.allInRange) {
    console.log(`Fetching AIFM jobs ${start_date} → ${end_date}…`);
    const result = await fetchAllAifmJobsInRange(auth.base, auth.bearer, start_date, end_date);
    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }
    aifmJobs = result.jobs;
    console.log(`AIFM rows: ${aifmJobs.length}`);
  } else {
    const byId = new Map();
    console.log(`Fetching AIFM ids: ${[...targetAifmIds].join(', ')} (${start_date}–${end_date})`);
    for (let page = 1; page <= 200; page++) {
      const res = await fetch(`${auth.base}/api/v1/jobs`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_token: auth.bearer,
          start_date,
          end_date,
          page,
          per_page: 50,
        }),
      });
      const json = await res.json();
      for (const row of json.data || []) {
        if (targetAifmIds.has(String(row.id))) byId.set(String(row.id), row);
      }
      if ((json.data || []).length < 50) break;
      if (byId.size >= targetAifmIds.size) break;
    }
    aifmJobs = [...byId.values()];
  }

  if (targetAifmIds.size && !args.allInRange) {
    aifmJobs = aifmJobs.filter((j) => targetAifmIds.has(String(j.id)));
  }

  let scanned = 0;
  let skippedNoEnd = 0;
  let skippedNoFsm = 0;
  let skippedAlreadyOk = 0;
  let updated = 0;
  let failed = 0;

  for (const job of aifmJobs) {
    scanned++;
    const aifmId = String(job.id);

    if (!aifmHasAppointmentEnd(job)) {
      skippedNoEnd++;
      continue;
    }

    const scheduledStart = parseAifmDateTime(job.job_start_date, job.job_start_time);
    const scheduledEnd = computeAifmWorkEndIso(job);
    if (!scheduledStart || !scheduledEnd) continue;

    const { data: existing } = await supabase
      .from('jobs')
      .select('id, job_number, scheduled_start, scheduled_end')
      .ilike('description', `%[AIFM:${aifmId}]%`)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) {
      skippedNoFsm++;
      continue;
    }

    const dur = aifmDurationDecimalHours(job);
    const { data: scheduleRows } = await supabase
      .from('job_schedule')
      .select('id, dur, jetime, jstime')
      .eq('job_id', existing.id)
      .limit(1);
    const schedule = scheduleRows?.[0];
    const scheduleDurOk = schedule && String(schedule.dur) === String(dur);
    const scheduleTimeOk =
      schedule &&
      timeFromIso(scheduledEnd) === (schedule.jetime || '').slice(0, 8);

    if (
      sameInstant(existing.scheduled_start, scheduledStart) &&
      sameInstant(existing.scheduled_end, scheduledEnd) &&
      scheduleDurOk &&
      scheduleTimeOk
    ) {
      skippedAlreadyOk++;
      continue;
    }

    const hrs =
      (new Date(scheduledEnd) - new Date(scheduledStart)) / (60 * 60 * 1000);

    console.log(
      `${args.dryRun ? '[dry-run] ' : ''}${existing.job_number} AIFM ${aifmId} | AIFM ${formatSlot(job)}`
    );
    console.log(`    was: ${existing.scheduled_start} → ${existing.scheduled_end}`);
    console.log(`    fix: ${scheduledStart} → ${scheduledEnd} (${hrs.toFixed(1)}h window)`);

    if (args.dryRun) {
      updated++;
      continue;
    }

    const { error: updErr } = await supabase
      .from('jobs')
      .update({
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updErr) {
      console.error(`    ✗ ${updErr.message}`);
      failed++;
      continue;
    }

    await supabase.from('job_schedule').delete().eq('job_id', existing.id);
    await supabase.from('job_schedule').insert({
      job_id: existing.id,
      jsdate: dateFromIso(scheduledStart),
      jedate: dateFromIso(scheduledEnd),
      jstime: timeFromIso(scheduledStart),
      jetime: timeFromIso(scheduledEnd),
      dur_type: 'hours',
      dur,
      address: null,
    });

    updated++;
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned AIFM jobs: ${scanned}`);
  console.log(`Updated: ${updated}${args.dryRun ? ' (dry-run)' : ''}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped (no AIFM end time): ${skippedNoEnd}`);
  console.log(`Skipped (no FSM job): ${skippedNoFsm}`);
  console.log(`Skipped (already correct): ${skippedAlreadyOk}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
