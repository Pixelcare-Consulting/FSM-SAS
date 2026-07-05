#!/usr/bin/env node
/**
 * Backfill portal technician_jobs from AIFM assigned_teches (CLI — no 10MB HTTP body limit).
 *
 * Fetches jobs directly from the AIFM API, matches tech names to portal technicians.full_name
 * (team codes like Z3 vs Y3 are ignored; trailing periods are stripped).
 *
 *   pnpm aifm:repair-techs
 *   pnpm aifm:repair-techs:dry
 *   pnpm aifm:repair-techs -- --job=2026-001907
 *   pnpm aifm:repair-techs -- --only-missing
 *   pnpm aifm:repair-techs -- --start=2026-01-01 --end=2026-06-30
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

function defaultDateRange() {
  const today = new Date();
  return {
    start: today.toISOString().slice(0, 10),
    end: '2028-12-31',
  };
}

function parseArgs(argv) {
  const defaults = defaultDateRange();
  const out = {
    dryRun: false,
    onlyMissing: false,
    start: defaults.start,
    end: defaults.end,
    job: [],
    aifm: [],
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--only-missing') out.onlyMissing = true;
    if (a.startsWith('--start=')) out.start = a.slice(8).trim();
    if (a.startsWith('--end=')) out.end = a.slice(6).trim();
    if (a.startsWith('--job=')) {
      out.job = a
        .slice(6)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (a.startsWith('--aifm=')) {
      out.aifm = a
        .slice(7)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
  }
  return out;
}

function extractAifmId(description) {
  const m = String(description || '').match(/\[AIFM:(\d+)\]/);
  return m ? m[1] : null;
}

function resolveTechnicianIdsFromAssigned(assignedTeches, technicians, { parseAifmAssignedTeches, matchTechnicianToAifmName }) {
  const teches = parseAifmAssignedTeches(assignedTeches);
  const ids = [];

  for (const t of teches) {
    const primary = (t.name || '').toString().trim();
    const raw = (t.raw || '').toString().trim();
    let m = primary ? matchTechnicianToAifmName(primary, technicians) : null;
    if (!m && raw && raw !== primary) {
      m = matchTechnicianToAifmName(raw, technicians);
    }
    if (m?.id) ids.push(m.id);
  }

  return [...new Set(ids)];
}

const PORTAL_JOBS_PAGE = 1000;

async function fetchPortalJobs(supabase, args) {
  if (args.job.length) {
    const rows = [];
    for (const jn of args.job) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, description, scheduled_start')
        .eq('job_number', jn)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (data) rows.push(data);
    }
    return rows;
  }

  const buildQuery = (from, to) => {
    let q = supabase
      .from('jobs')
      .select('id, job_number, description, scheduled_start')
      .is('deleted_at', null)
      .ilike('description', '%[AIFM:%')
      .gte('scheduled_start', `${args.start}T00:00:00`)
      .lte('scheduled_start', `${args.end}T23:59:59`)
      .order('scheduled_start', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (args.aifm.length) {
      q = q.or(args.aifm.map((id) => `description.ilike.%[AIFM:${id}]%`).join(','));
    }

    return q;
  };

  const all = [];
  let from = 0;

  for (;;) {
    const to = from + PORTAL_JOBS_PAGE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PORTAL_JOBS_PAGE) break;
    from += PORTAL_JOBS_PAGE;
  }

  return all;
}

async function loadCurrentTechIds(supabase, jobId) {
  const { data, error } = await supabase
    .from('technician_jobs')
    .select('technician_id')
    .eq('job_id', jobId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map((r) => r.technician_id).sort();
}

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((id, i) => id === sb[i]);
}

async function applyTechnicianAssignments(supabase, jobId, techIds) {
  const now = new Date().toISOString();
  await supabase
    .from('technician_jobs')
    .update({ deleted_at: now })
    .eq('job_id', jobId)
    .is('deleted_at', null);

  if (!techIds.length) return;

  const { error } = await supabase.from('technician_jobs').insert(
    techIds.map((technician_id) => ({
      technician_id,
      job_id: jobId,
      assignment_status: 'ASSIGNED',
    }))
  );
  if (error) throw error;
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

  const supabase = createClient(url, key);
  const { authorizeAifmBearer, fetchAllAifmJobsInRange } = await import(
    '../lib/integrations/aifmApiClient.js'
  );
  const { refreshTechnicianHoursForJobId } = await import('../lib/supabase/technicianHours.js');
  const { parseAifmAssignedTeches } = await import('../lib/utils/aifmAssignedTechs.js');
  const { matchTechnicianToAifmName } = await import('../lib/utils/aifmTechnicianResolve.js');
  const techMatch = { parseAifmAssignedTeches, matchTechnicianToAifmName };

  let portalJobs = await fetchPortalJobs(supabase, args);
  console.log(`Portal AIFM jobs ${args.start} → ${args.end}: ${portalJobs.length}`);
  if (args.limit) portalJobs = portalJobs.slice(0, args.limit);

  if (!portalJobs.length) {
    console.log('No matching portal AIFM jobs.');
    return;
  }

  const aifmIds = new Set();
  const aifmIdByJobId = new Map();
  for (const j of portalJobs) {
    const id = extractAifmId(j.description);
    if (id) {
      aifmIds.add(id);
      aifmIdByJobId.set(j.id, id);
    }
  }

  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, token);
  if (!auth) {
    console.error('AIFM authorize failed');
    process.exit(1);
  }

  console.log(`Fetching AIFM jobs ${args.start} → ${args.end}…`);
  const fetchResult = await fetchAllAifmJobsInRange(auth.base, auth.bearer, args.start, args.end);
  if (fetchResult.error) {
    console.error(fetchResult.error);
    process.exit(1);
  }

  const aifmById = new Map();
  for (const row of fetchResult.jobs || []) {
    const id = String(row.id);
    if (aifmIds.has(id)) aifmById.set(id, row);
  }

  const { data: techRows, error: techErr } = await supabase
    .from('technicians')
    .select('id, full_name')
    .is('deleted_at', null);
  if (techErr) throw techErr;
  const technicians = techRows || [];

  let scanned = 0;
  let updated = 0;
  let skippedNoAifm = 0;
  let skippedNoTeches = 0;
  let skippedUnmatched = 0;
  let skippedAlreadyOk = 0;
  let skippedOnlyMissing = 0;
  let failed = 0;

  for (const job of portalJobs) {
    scanned++;
    const aifmId = aifmIdByJobId.get(job.id);
    const aifmJob = aifmId ? aifmById.get(aifmId) : null;

    if (!aifmJob) {
      skippedNoAifm++;
      console.warn(`⚠ ${job.job_number}: AIFM ${aifmId || '—'} not in API range`);
      continue;
    }

    const assigned = aifmJob.assigned_teches;
    if (!assigned || !String(assigned).trim()) {
      skippedNoTeches++;
      continue;
    }

    const targetIds = resolveTechnicianIdsFromAssigned(assigned, technicians, techMatch);
    if (!targetIds.length) {
      skippedUnmatched++;
      console.warn(`⚠ ${job.job_number}: no portal match for "${assigned}"`);
      continue;
    }

    const currentIds = await loadCurrentTechIds(supabase, job.id);

    if (args.onlyMissing && currentIds.length > 0) {
      skippedOnlyMissing++;
      continue;
    }

    if (sameIdSet(currentIds, targetIds)) {
      skippedAlreadyOk++;
      continue;
    }

    const parsed = parseAifmAssignedTeches(assigned);
    const label = parsed.map((t) => t.raw).join(', ');

    if (args.dryRun) {
      console.log(
        `[dry-run] ${job.job_number}: ${currentIds.length} → ${targetIds.length} tech(s) | AIFM: ${label}`
      );
      updated++;
      continue;
    }

    try {
      await applyTechnicianAssignments(supabase, job.id, targetIds);
      try {
        await refreshTechnicianHoursForJobId(supabase, job.id);
      } catch (e) {
        console.warn(`  refreshTechnicianHours ${job.job_number}: ${e?.message || e}`);
      }
      updated++;
      console.log(`✓ ${job.job_number}: ${currentIds.length} → ${targetIds.length} | ${label}`);
    } catch (e) {
      failed++;
      console.warn(`✗ ${job.job_number}: ${e?.message || e}`);
    }
  }

  console.log(
    `\nDone. scanned=${scanned} updated=${updated} already_ok=${skippedAlreadyOk}` +
      ` no_aifm=${skippedNoAifm} no_teches=${skippedNoTeches} unmatched=${skippedUnmatched}` +
      ` only_missing_skip=${skippedOnlyMissing} failed=${failed}` +
      (args.dryRun ? ' (dry-run)' : '')
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
