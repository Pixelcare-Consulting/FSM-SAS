#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Extract Job Migration rows for a calendar month into a reference Excel file.
 * Uses the same date filter as /api/jobs/migration/preview and apply.
 *
 * Usage:
 *   node scripts/export-job-migration-month.js
 *   node scripts/export-job-migration-month.js --month=5 --year=2026
 *   node scripts/export-job-migration-month.js --file=public/sample-migration/Jobs\ -\ 2025-12-25\ -\ 2026-12-31.xlsx
 *   node scripts/export-job-migration-month.js --with-db
 *   pnpm migrate:jobs-export-month
 */

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
} catch (_) {
  // dotenv optional
}

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.join(
  REPO_ROOT,
  'public',
  'sample-migration',
  'Jobs - 2025-12-25 - 2026-12-31.xlsx'
);

function parseArgs(argv) {
  const out = {
    file: null,
    output: null,
    month: null,
    year: null,
    dateStart: null,
    dateEnd: null,
    withDb: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--with-db') out.withDb = true;
    else if (arg.startsWith('--file=')) out.file = arg.slice(7).trim();
    else if (arg.startsWith('--output=')) out.output = arg.slice(9).trim();
    else if (arg.startsWith('--month=')) out.month = Number(arg.slice(8));
    else if (arg.startsWith('--year=')) out.year = Number(arg.slice(7));
    else if (arg.startsWith('--date-start=')) out.dateStart = arg.slice(13).trim();
    else if (arg.startsWith('--date-end=')) out.dateEnd = arg.slice(11).trim();
  }

  return out;
}

function printHelp() {
  console.log(`
Extract Job Migration rows for a month into reference Excel.

Options:
  --month=N           Calendar month (1-12). Default: current month.
  --year=YYYY         Calendar year. Default: current year.
  --date-start=YYYY-MM-DD   Override range start (instead of --month/--year).
  --date-end=YYYY-MM-DD     Override range end.
  --file=PATH         Source .xlsx (default: public/sample-migration/Jobs - 2025-12-25 - 2026-12-31.xlsx)
  --output=PATH       Output .xlsx (default: public/sample-migration/Jobs - {start} - {end}.xlsx)
  --with-db           Add FSM_Job_Number / FSM_Status columns when Supabase env is set.
  --help, -h          Show this help.

Examples:
  node scripts/export-job-migration-month.js --month=5 --year=2026
  pnpm migrate:jobs-export-month
`);
}

function safeTrim(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  return v;
}

function normalizeRow(row) {
  const o = {};
  for (const k of Object.keys(row)) o[k] = safeTrim(row[k]);
  return o;
}

function resolveDateRange(args) {
  if (args.dateStart || args.dateEnd) {
    const start = args.dateStart || args.dateEnd;
    const end = args.dateEnd || args.dateStart;
    return { dateStart: start, dateEnd: end };
  }

  const now = new Date();
  const year = args.year || now.getFullYear();
  const month = args.month || now.getMonth() + 1;

  if (month < 1 || month > 12) {
    throw new Error(`Invalid --month=${month}; expected 1-12`);
  }

  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    dateStart: `${year}-${mm}-01`,
    dateEnd: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function filterRowsByJobStartDate(rows, dateStart, dateEnd) {
  const startDate = dateStart ? new Date(dateStart) : null;
  const endDate = dateEnd ? new Date(dateEnd) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);

  return rows.filter((row) => {
    const jobStartStr = (row['Job Start DateTime'] || '').toString().trim();
    if (!jobStartStr) return false;
    const jobStart = new Date(jobStartStr);
    if (Number.isNaN(jobStart.getTime())) return false;
    if (startDate && jobStart < startDate) return false;
    if (endDate && jobStart > endDate) return false;
    return true;
  });
}

function readMigrationWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Source file not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false }).map(normalizeRow);
  const headers = rows.length ? Object.keys(rows[0]) : [];

  return { sheetName, rows, headers };
}

function countByField(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const key = (row[field] ?? '(blank)').toString();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function buildSummaryRows({ sourceFile, sheetName, dateStart, dateEnd, totalBefore, filteredRows }) {
  const statusCounts = countByField(filteredRows, 'Status');
  const sapCounts = countByField(filteredRows, 'SAP ID');
  const uniqueSapIds = new Set(filteredRows.map((r) => r['SAP ID']).filter(Boolean)).size;

  const summary = [
    { Metric: 'Generated At', Value: new Date().toISOString() },
    { Metric: 'Source File', Value: path.relative(REPO_ROOT, sourceFile) },
    { Metric: 'Source Sheet', Value: sheetName },
    { Metric: 'Date Range Start', Value: dateStart },
    { Metric: 'Date Range End', Value: dateEnd },
    { Metric: 'Total Source Rows', Value: totalBefore },
    { Metric: 'Filtered Rows', Value: filteredRows.length },
    { Metric: 'Excluded Rows', Value: totalBefore - filteredRows.length },
    { Metric: 'Unique SAP IDs', Value: uniqueSapIds },
    { Metric: '', Value: '' },
    { Metric: '--- Status breakdown ---', Value: '' },
  ];

  for (const [status, count] of statusCounts) {
    summary.push({ Metric: `Status ${status}`, Value: count });
  }

  summary.push({ Metric: '', Value: '' });
  summary.push({ Metric: '--- Top SAP IDs ---', Value: '' });

  for (const [sapId, count] of sapCounts.slice(0, 25)) {
    summary.push({ Metric: sapId, Value: count });
  }

  return summary;
}

async function enrichWithDbStatus(rows, dateStart, dateEnd) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[export] --with-db skipped: Supabase env not set');
    return rows;
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rangeStart = new Date(`${dateStart}T00:00:00.000Z`).toISOString();
  const rangeEnd = new Date(`${dateEnd}T23:59:59.999Z`).toISOString();

  const { data: dbJobs, error } = await supabase
    .from('jobs')
    .select('job_number, title, status, scheduled_start')
    .gte('scheduled_start', rangeStart)
    .lte('scheduled_start', rangeEnd)
    .is('deleted_at', null);

  if (error) {
    console.warn('[export] DB lookup failed:', error.message);
    return rows;
  }

  const byPersonalJobId = new Map();
  const byTitle = new Map();
  for (const job of dbJobs || []) {
    if (job.title) byTitle.set(job.title, job);
    const m = /^Migrated Job\s+(.+)$/i.exec(String(job.title || '').trim());
    if (m) byPersonalJobId.set(m[1].trim(), job);
  }

  return rows.map((row) => {
    const personalJobId = (row['Personal Job ID'] || '').toString().trim();
    const legacyId = (row['ID'] || '').toString().trim();
    const matched =
      (personalJobId && byPersonalJobId.get(personalJobId)) ||
      (personalJobId && byTitle.get(`Migrated Job ${personalJobId}`)) ||
      (legacyId && byTitle.get(`Migrated Job ${legacyId}`)) ||
      null;

    return {
      ...row,
      FSM_Job_Number: matched?.job_number || null,
      FSM_Status: matched?.status || null,
      FSM_In_Database: matched ? 'YES' : 'NO',
    };
  });
}

function writeWorkbook({ outputPath, jobsSheetName, rows, summaryRows }) {
  const wb = XLSX.utils.book_new();
  const jobsSheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, jobsSheet, jobsSheetName || 'Jobs');

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(wb, outputPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const { dateStart, dateEnd } = resolveDateRange(args);
  const sourceFile = path.resolve(REPO_ROOT, args.file || DEFAULT_SOURCE);
  const defaultOutput = path.join(
    REPO_ROOT,
    'public',
    'sample-migration',
    `Jobs - ${dateStart} - ${dateEnd}.xlsx`
  );
  const outputPath = path.resolve(REPO_ROOT, args.output || defaultOutput);

  console.log('=== Job Migration Month Export ===');
  console.log('Source:', path.relative(REPO_ROOT, sourceFile));
  console.log('Range :', dateStart, 'to', dateEnd);

  const { sheetName, rows: allRows } = readMigrationWorkbook(sourceFile);
  const filteredRows = filterRowsByJobStartDate(allRows, dateStart, dateEnd);

  let exportRows = filteredRows;
  if (args.withDb) {
    exportRows = await enrichWithDbStatus(filteredRows, dateStart, dateEnd);
    const inDb = exportRows.filter((r) => r.FSM_In_Database === 'YES').length;
    console.log(`DB match: ${inDb}/${exportRows.length} rows already in FSM`);
  }

  const summaryRows = buildSummaryRows({
    sourceFile,
    sheetName,
    dateStart,
    dateEnd,
    totalBefore: allRows.length,
    filteredRows: exportRows,
  });

  writeWorkbook({
    outputPath,
    jobsSheetName: sheetName,
    rows: exportRows,
    summaryRows,
  });

  console.log('Sheet :', sheetName);
  console.log('Rows  :', exportRows.length, `(excluded ${allRows.length - filteredRows.length})`);
  console.log('Output:', path.relative(REPO_ROOT, outputPath));
  console.log('Done.');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
