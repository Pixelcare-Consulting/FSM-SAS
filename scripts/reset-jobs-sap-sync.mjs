#!/usr/bin/env node
/**
 * Clear SAP sync markers on portal jobs so they appear as "unsynced" and can be
 * picked up again by Jobs → Sync to SAP (sap_activity_id IS NULL).
 *
 * WARNING: After reset, the next sync POSTs new SAP Activities (does not PATCH
 * existing ones). Only use if SAP activities were removed or you intentionally
 * want fresh activities.
 *
 *   pnpm job:reset-sap-sync -- --job=2026-001138
 *   pnpm job:reset-sap-sync -- --start=2026-05-01 --end=2026-05-31 --dry-run
 *   pnpm job:reset-sap-sync -- --all --yes --dry-run
 *   pnpm job:reset-sap-sync -- --start=2026-05-01 --end=2026-05-31 --clear-logs
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

const FETCH_PAGE = 500;
const UPDATE_CHUNK = 100;

function parseArgs(argv) {
  const out = {
    dryRun: false,
    yes: false,
    all: false,
    clearLogs: false,
    start: null,
    end: null,
    job: [],
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--yes') out.yes = true;
    if (a === '--all') out.all = true;
    if (a === '--clear-logs') out.clearLogs = true;
    if (a.startsWith('--start=')) out.start = a.slice(8).trim();
    if (a.startsWith('--end=')) out.end = a.slice(6).trim();
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
    if (a.startsWith('--job=')) {
      out.job.push(
        ...a
          .slice(6)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
  }
  return out;
}

function normalizeDateFrom(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.includes('T') ? s : `${s}T00:00:00.000Z`;
}

function normalizeDateTo(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.includes('T') ? s : `${s}T23:59:59.999Z`;
}

function printUsage() {
  console.error(
    [
      'Clear jobs.sap_activity_id + last_synced_at so jobs show as unsynced.',
      '',
      'Usage (pick one scope):',
      '  --job=2026-001138[,2026-001139]',
      '  --start=YYYY-MM-DD --end=YYYY-MM-DD   (jobs.created_at, synced only)',
      '  --all --yes                           (every synced job — requires --yes)',
      '',
      'Options:',
      '  --dry-run       Preview only',
      '  --limit=N       Cap rows processed',
      '  --clear-logs    Also delete job_sync_logs for affected jobs',
    ].join('\n')
  );
}

function validateArgs(args) {
  const hasJob = args.job.length > 0;
  const hasRange = Boolean(args.start && args.end);
  const hasAll = args.all;

  if (!hasJob && !hasRange && !hasAll) {
    printUsage();
    process.exit(1);
  }

  if (hasAll && !args.yes && !args.dryRun) {
    console.error('--all requires --yes (or use --dry-run first).');
    process.exit(1);
  }

  if ((args.start && !args.end) || (!args.start && args.end)) {
    console.error('Provide both --start and --end for date filtering.');
    process.exit(1);
  }
}

async function fetchSyncedJobs(supabase, args) {
  const dateFrom = normalizeDateFrom(args.start);
  const dateTo = normalizeDateTo(args.end);

  if (args.job.length) {
    const rows = [];
    for (const jobNumber of args.job) {
      let query = supabase
        .from('jobs')
        .select('id, job_number, sap_activity_id, last_synced_at, created_at')
        .eq('job_number', jobNumber)
        .is('deleted_at', null)
        .not('sap_activity_id', 'is', null);

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (data) rows.push(data);
      else console.warn(`Skip ${jobNumber}: not found or already unsynced`);
    }
    return rows;
  }

  const rows = [];
  let offset = 0;
  const maxRows = args.limit || Infinity;

  while (rows.length < maxRows) {
    const pageSize = Math.min(FETCH_PAGE, maxRows - rows.length);
    let query = supabase
      .from('jobs')
      .select('id, job_number, sap_activity_id, last_synced_at, created_at')
      .is('deleted_at', null)
      .not('sap_activity_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function clearSyncLogs(supabase, jobIds) {
  let deleted = 0;
  for (let i = 0; i < jobIds.length; i += UPDATE_CHUNK) {
    const chunk = jobIds.slice(i, i + UPDATE_CHUNK);
    const { error, count } = await supabase
      .from('job_sync_logs')
      .delete({ count: 'exact' })
      .in('job_id', chunk);
    if (error) throw error;
    deleted += count ?? 0;
  }
  return deleted;
}

async function resetJobs(supabase, jobIds) {
  let updated = 0;
  for (let i = 0; i < jobIds.length; i += UPDATE_CHUNK) {
    const chunk = jobIds.slice(i, i + UPDATE_CHUNK);
    const { data, error } = await supabase
      .from('jobs')
      .update({ sap_activity_id: null, last_synced_at: null })
      .in('id', chunk)
      .select('id');
    if (error) throw error;
    updated += data?.length ?? 0;
  }
  return updated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const jobs = await fetchSyncedJobs(supabase, args);

  if (!jobs.length) {
    console.log('No synced jobs matched (sap_activity_id already null).');
    return;
  }

  console.log(`Matched ${jobs.length} synced job(s).`);
  if (args.dryRun) {
    for (const j of jobs.slice(0, 20)) {
      console.log(
        `[dry-run] ${j.job_number} sap_activity_id=${j.sap_activity_id} last_synced_at=${j.last_synced_at || '—'}`
      );
    }
    if (jobs.length > 20) console.log(`… and ${jobs.length - 20} more`);
    console.log('\nDry run only — no changes written.');
    return;
  }

  const jobIds = jobs.map((j) => j.id);
  const updated = await resetJobs(supabase, jobIds);
  let logsDeleted = 0;
  if (args.clearLogs) {
    logsDeleted = await clearSyncLogs(supabase, jobIds);
  }

  console.log(`Reset ${updated} job(s): sap_activity_id + last_synced_at cleared.`);
  if (args.clearLogs) console.log(`Deleted ${logsDeleted} job_sync_logs row(s).`);
  console.log('Use Jobs → Sync to SAP to push them again.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
