#!/usr/bin/env node
/**
 * Backfill legacy / wrong `jobs.status` values to SAP numeric U_JobStatusID.
 *
 * Source of truth: SAP Service Layer UDT `U_API_JOB_STATUS`.
 *
 * Safety:
 * - Default is dry-run (no writes).
 * - Apply mode requires `--apply --yes`.
 * - Only updates when the match is unambiguous.
 * - Flags unknown numeric IDs and ambiguous/unknown labels for manual review.
 *
 * Examples:
 *   node scripts/backfill-wrong-statuses.mjs --dry-run --limit=50
 *   node scripts/backfill-wrong-statuses.mjs --job=2026-001138,2026-001139 --dry-run
 *   node scripts/backfill-wrong-statuses.mjs --start=2026-05-01 --end=2026-05-31 --dry-run
 *   node scripts/backfill-wrong-statuses.mjs --apply --yes --limit=500
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

import sapService, {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../lib/services/sapService.js';
import {
  buildSapStatusIndex,
  resolveLegacyStatusToSapId,
} from '../lib/jobs/resolveLegacyJobStatusToSap.js';

const FETCH_PAGE = 500;

function parseArgs(argv) {
  const out = {
    dryRun: true,
    apply: false,
    yes: false,
    start: null,
    end: null,
    job: [],
    limit: null,
    includeOk: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--apply') out.apply = true;
    if (a === '--yes') out.yes = true;
    if (a.startsWith('--start=')) out.start = a.slice(8).trim();
    if (a.startsWith('--end=')) out.end = a.slice(6).trim();
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
    if (a === '--limit') {
      const next = argv[i + 1];
      if (next != null && !String(next).startsWith('--')) {
        out.limit = Math.max(0, parseInt(String(next), 10) || 0);
        i++;
      } else {
        out.limit = 0;
      }
    }
    if (a === '--include-ok') out.includeOk = true;
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
  if (out.apply) out.dryRun = false;
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
      'Backfill jobs.status to SAP U_JobStatusID using SAP U_API_JOB_STATUS.',
      '',
      'Scope options (pick none = all rows):',
      '  --job=2026-001138[,2026-001139]',
      '  --start=YYYY-MM-DD --end=YYYY-MM-DD   (jobs.created_at)',
      '',
      'Modes:',
      '  --dry-run            Report only (default)',
      '  --apply --yes        Write changes (requires confirmation)',
      '',
      'Other options:',
      '  --limit=N            Cap rows processed',
      '  --include-ok         Include already-ok rows in sample output',
    ].join('\n')
  );
}

function validateArgs(args) {
  if ((args.start && !args.end) || (!args.start && args.end)) {
    console.error('Provide both --start and --end for date filtering.');
    printUsage();
    process.exit(1);
  }
  if (args.apply && !args.yes) {
    console.error('--apply requires --yes (run --dry-run first to review).');
    process.exit(1);
  }
}

function isNumericStatus(s) {
  return /^-?\d+$/.test(String(s ?? '').trim());
}

function buildChanges(before = {}, after = {}) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { before: b ?? null, after: a ?? null };
    }
  }
  return Object.keys(changes).length ? changes : null;
}

function cleanObject(obj) {
  if (!obj || typeof obj !== 'object') return {};
  return Object.entries(obj).reduce((acc, [k, v]) => {
    if (v !== undefined) acc[k] = v;
    return acc;
  }, {});
}

async function writeMigrationAuditLog({ supabase, job, oldStatus, newStatusId, sapLabel, reason }) {
  const row = {
    user_id: null,
    user_email: null,
    user_name: 'SYSTEM',
    action: 'MIGRATION_JOBS',
    category: 'migration',
    entity_type: 'job',
    entity_id: job?.id != null ? String(job.id) : null,
    entity_label: job?.job_number || job?.id || null,
    description: 'Backfilled job status to SAP U_JobStatusID',
    details: cleanObject({
      oldStatus: oldStatus != null ? String(oldStatus) : null,
      newStatus: newStatusId != null ? String(newStatusId) : null,
      sapLabel: sapLabel || null,
      matchReason: reason || null,
      tool: 'scripts/backfill-wrong-statuses.mjs',
    }),
    changes: buildChanges({ status: oldStatus }, { status: newStatusId }),
    status: 'success',
    source: 'migration',
  };

  const { error } = await supabase.from('audit_logs').insert(row);
  if (error) {
    console.warn('[audit_logs] insert failed:', error.message || error);
  }
}

async function fetchSapJobStatuses(sessionCookies) {
  const data = await sapService.makeRequest('U_API_JOB_STATUS', { method: 'GET' }, sessionCookies);
  const value = data?.value;
  if (!Array.isArray(value)) {
    throw new Error('Unexpected SAP U_API_JOB_STATUS response (missing value array)');
  }
  return value.map((item) => ({
    Code: item.Code,
    U_JobStatusID: item.U_JobStatusID != null ? String(item.U_JobStatusID) : '',
    U_JobStatus: item.U_JobStatus || item.Name || '',
  }));
}

async function fetchJobs(supabase, args) {
  const dateFrom = normalizeDateFrom(args.start);
  const dateTo = normalizeDateTo(args.end);
  const maxRows = args.limit || Infinity;

  // Explicit job numbers take precedence.
  if (args.job.length) {
    const rows = [];
    for (const jobNumber of args.job) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, status, created_at, updated_at')
        .eq('job_number', jobNumber)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (data) rows.push(data);
      else console.warn(`Skip ${jobNumber}: not found`);
    }
    return rows;
  }

  const rows = [];
  let offset = 0;

  while (rows.length < maxRows) {
    const pageSize = Math.min(FETCH_PAGE, maxRows - rows.length);
    let query = supabase
      .from('jobs')
      .select('id, job_number, status, created_at, updated_at')
      .is('deleted_at', null)
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

async function applyJobStatusUpdate({ supabase, job, newStatusId, sapLabel, reason }) {
  const before = { status: job.status };
  const after = { status: newStatusId };
  const changes = buildChanges(before, after);

  const { data, error } = await supabase
    .from('jobs')
    .update({ status: newStatusId })
    .eq('id', job.id)
    .select('id, job_number, status')
    .single();
  if (error) throw error;

  // Write audit record (best-effort; does not block the backfill).
  await writeMigrationAuditLog({
    supabase,
    job,
    oldStatus: before.status ?? '',
    newStatusId,
    sapLabel,
    reason,
  });

  return data;
}

function summarizeReport(report) {
  const s = report.summary;
  return [
    `Matched jobs: ${s.total}`,
    `already_ok: ${s.already_ok}`,
    `would_update: ${s.would_update}`,
    `updated: ${s.updated}`,
    `unknown_numeric: ${s.unknown_numeric}`,
    `ambiguous: ${s.ambiguous}`,
    `unknown: ${s.unknown}`,
    `sap_status_rows: ${s.sap_status_rows}`,
  ].join('\n');
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

  const login = await loginSessionCookiesFromEnvironment();
  const sapCookies = unwrapSapEnvironmentLogin(login);
  if (!sapCookies) {
    console.error(
      'Unable to log in to SAP from environment. Ensure SAP_B1_COMPANY_DB, SAP_B1_USERNAME, SAP_B1_PASSWORD, SAP_SERVICE_LAYER_BASE_URL are set.'
    );
    process.exit(1);
  }

  const sapRows = await fetchSapJobStatuses(sapCookies);
  const sapIndex = buildSapStatusIndex(sapRows);

  const jobs = await fetchJobs(supabase, args);

  const report = {
    meta: {
      mode: args.apply ? 'apply' : 'dry_run',
      startedAt: new Date().toISOString(),
      filter: {
        jobNumbers: args.job.length ? args.job : null,
        start: args.start || null,
        end: args.end || null,
        limit: args.limit || null,
      },
    },
    summary: {
      total: jobs.length,
      sap_status_rows: sapRows.length,
      already_ok: 0,
      would_update: 0,
      updated: 0,
      unknown_numeric: 0,
      ambiguous: 0,
      unknown: 0,
    },
    samples: {
      would_update: [],
      updated: [],
      unknown_numeric: [],
      ambiguous: [],
      unknown: [],
      already_ok: [],
    },
  };

  for (const job of jobs) {
    const raw = job?.status != null ? String(job.status).trim() : '';

    // Numeric status: validate against SAP list
    if (isNumericStatus(raw)) {
      if (sapIndex.byId.has(raw)) {
        report.summary.already_ok += 1;
        if (args.includeOk && report.samples.already_ok.length < 25) {
          report.samples.already_ok.push({
            job_id: job.id,
            job_number: job.job_number,
            status: raw,
            sapLabel: sapIndex.byId.get(raw),
          });
        }
      } else {
        report.summary.unknown_numeric += 1;
        if (report.samples.unknown_numeric.length < 50) {
          report.samples.unknown_numeric.push({
            job_id: job.id,
            job_number: job.job_number,
            status: raw,
          });
        }
      }
      continue;
    }

    // Non-numeric: try to resolve to an SAP ID
    const resolved = resolveLegacyStatusToSapId(raw, sapIndex);
    if (resolved.kind === 'matched') {
      report.summary.would_update += 1;
      const entry = {
        job_id: job.id,
        job_number: job.job_number,
        oldStatus: raw,
        newStatus: resolved.id,
        sapLabel: resolved.label,
        reason: resolved.reason,
      };
      if (!args.apply) {
        if (report.samples.would_update.length < 50) report.samples.would_update.push(entry);
        continue;
      }

      const updated = await applyJobStatusUpdate({
        supabase,
        job,
        newStatusId: resolved.id,
        sapLabel: resolved.label,
        reason: resolved.reason,
      });
      report.summary.updated += 1;
      if (report.samples.updated.length < 50) {
        report.samples.updated.push({
          ...entry,
          statusAfter: updated?.status ?? resolved.id,
        });
      }
      continue;
    }

    if (resolved.kind === 'ambiguous') {
      report.summary.ambiguous += 1;
      if (report.samples.ambiguous.length < 50) {
        report.samples.ambiguous.push({
          job_id: job.id,
          job_number: job.job_number,
          status: raw,
          normalized: resolved.normalized,
          candidates: (resolved.candidates || []).map((id) => ({
            id,
            label: sapIndex.byId.get(id) || null,
          })),
          reason: resolved.reason || null,
        });
      }
      continue;
    }

    report.summary.unknown += 1;
    if (report.samples.unknown.length < 50) {
      report.samples.unknown.push({
        job_id: job.id,
        job_number: job.job_number,
        status: raw,
        normalized: resolved.normalized,
      });
    }
  }

  report.meta.finishedAt = new Date().toISOString();
  report.meta.durationMs =
    new Date(report.meta.finishedAt).getTime() - new Date(report.meta.startedAt).getTime();

  console.log(summarizeReport(report));
  console.log('\n--- report_json ---');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

