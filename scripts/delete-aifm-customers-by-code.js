/**
 * Surgical delete customers by SAP CardCode (`customer.customer_code`).
 *
 * `customer_address_details` has no FK to `customer`; delete those rows explicitly or they stay orphaned.
 * Deleting `customer` CASCADEs: contacts, customer_location, locations, equipments, service_call,
 * jobs, customer_notes (and other tables referencing jobs/customers with CASCADE as in fsm-schema).
 *
 * Exception: `job_technician_admin_messages` uses ON DELETE RESTRICT (see fix_job_messages_cascade_delete.sql).
 * This script deletes those rows for affected jobs before removing customers.
 *
 * Consolidated fresh AIFM migrate (same `--file=` everywhere):
 *
 *   pnpm migrate:aifm-delete-by-code -- --codes-from-excel --file=public/sample-migration/your.xlsx --dry-run
 *   pnpm migrate:aifm-delete-by-code -- --codes-from-excel --file=... --confirm=DELETE
 *   pnpm migrate:aifm-masterlist -- --file=...
 *   pnpm migrate:aifm-site-notes:update -- ...   # pass `--file=` if different from runner default:
 *     node scripts/run-aifm-masterlist-then-site-notes.js -- --only-site-notes --file=...
 *   # or full chain / fresh-from-workbook orchestrator:
 *   pnpm migrate:aifm-full:latest -- --file=...
 *   pnpm migrate:aifm-fresh-full -- --wipe --file=... --dry-run
 *   pnpm migrate:aifm-fresh-full -- --wipe --file=... --confirm=DELETE
 *
 * Flags:
 *   --codes=C001,C002
 *   --codes-file=path/to/codes.txt   (one code per line, # comments)
 *   --codes-from-excel               (distinct SAP_CardCode from sheet; skips CP placeholders + SAP Lead rows)
 *   --sheet=Mapped AIFM to SAP
 *   --file=...                       (excel path when using --codes-from-excel; default from aifmMasterlistPaths)
 *   --dry-run
 *   --confirm=DELETE                 required to perform deletes (not needed with --dry-run)
 */

try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config({ path: '.env' });
} catch (_) {}

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const {
  DEFAULT_AIFM_MASTERLIST_WORKBOOK,
} = require('./aifmMasterlistPaths');

const DEFAULT_SHEET = 'Mapped AIFM to SAP';
const IN_CHUNK = 100;

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function isCpPlaceholder(cardCode) {
  return /^CP\d+$/i.test(str(cardCode));
}

/** Same semantics as scripts/import-aifm-masterlist-customers.js — leads are not CardCode customers. */
function isSapMasterlistLeadRow(row) {
  const raw = str(row.SAP_Source);
  if (raw && /^sap\s*leads?$/i.test(raw)) return true;
  const code = str(row.SAP_CardCode);
  if (!raw && /^L\d+/i.test(code)) return true;
  return false;
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    confirm: null,
    file: DEFAULT_AIFM_MASTERLIST_WORKBOOK,
    sheet: DEFAULT_SHEET,
    codesFromExcel: false,
    codesCsv: null,
    codesFile: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--codes-from-excel') out.codesFromExcel = true;
    if (a.startsWith('--codes=')) out.codesCsv = a.slice(8).trim();
    if (a.startsWith('--codes-file=')) out.codesFile = a.slice(13).trim();
    if (a.startsWith('--file=')) out.file = a.slice(7).trim();
    if (a.startsWith('--sheet=')) out.sheet = a.slice(8).trim();
    if (a.startsWith('--confirm=')) out.confirm = a.slice(10).trim();
  }
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function readCodesFromFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const codes = [];
  for (let line of raw.split(/\r?\n/)) {
    const i = line.indexOf('#');
    if (i >= 0) line = line.slice(0, i);
    const c = str(line);
    if (c) codes.push(c);
  }
  return codes;
}

function readCodesFromExcel(filePath, sheetName) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Workbook not found: ${resolved}`);
  const wb = XLSX.readFile(resolved, { cellDates: false });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: "${sheetName}"`);

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  const set = new Set();
  for (const row of rows) {
    if (isSapMasterlistLeadRow(row)) continue;
    const code = str(row.SAP_CardCode);
    if (!code || isCpPlaceholder(code)) continue;
    set.add(code);
  }
  return [...set];
}

function mergeDeduped(...arrays) {
  const set = new Set();
  for (const arr of arrays) {
    for (const c of arr || []) set.add(str(c));
  }
  set.delete('');
  return [...set].sort((a, b) => a.localeCompare(b));
}

async function fetchCustomersForCodes(supabase, codes) {
  const found = [];
  for (const slice of chunk(codes, IN_CHUNK)) {
    const { data, error } = await supabase
      .from('customer')
      .select('id, customer_code')
      .in('customer_code', slice);
    if (error) throw error;
    found.push(...(data || []));
  }
  return found;
}

async function countWithIn(supabase, table, col, ids, selectCol = 'id') {
  if (!ids.length) return 0;
  let total = 0;
  for (const slice of chunk(ids, IN_CHUNK)) {
    const { count, error } = await supabase
      .from(table)
      .select(selectCol, { count: 'exact', head: true })
      .in(col, slice);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

async function countAddressDetailsForCodes(supabase, codes) {
  let total = 0;
  for (const slice of chunk(codes, IN_CHUNK)) {
    const { count, error } = await supabase
      .from('customer_address_details')
      .select('id', { count: 'exact', head: true })
      .in('customer_code', slice);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

/** Jobs for these customers (needed to clear RESTRICT FK on job_technician_admin_messages). */
async function fetchJobIdsForCustomerIds(supabase, customerIds) {
  const ids = [];
  for (const slice of chunk(customerIds, IN_CHUNK)) {
    const { data, error } = await supabase.from('jobs').select('id').in('customer_id', slice);
    if (error) throw error;
    for (const r of data || []) ids.push(r.id);
  }
  return ids;
}

async function deleteJobTechnicianAdminMessagesForJobIds(supabase, jobIds) {
  if (!jobIds.length) return 0;
  let removed = 0;
  const unique = [...new Set(jobIds)];
  for (const slice of chunk(unique, IN_CHUNK)) {
    const { data, error } = await supabase
      .from('job_technician_admin_messages')
      .delete()
      .in('job_id', slice)
      .select('id');
    if (error) throw error;
    removed += data?.length ?? 0;
  }
  console.log(
    `[done] job_technician_admin_messages by job_id: slices=${chunk(unique, IN_CHUNK).length}, rows_removed≈${removed}`,
  );
  return removed;
}

async function deleteInChunksByColumn(supabase, table, col, values) {
  let removed = 0;
  for (const slice of chunk(values, IN_CHUNK)) {
    const { data, error } = await supabase.from(table).delete().in(col, slice).select('id');
    if (error) throw error;
    removed += data?.length ?? 0;
  }
  console.log(`[done] ${table} by ${col}: slices=${chunk(values, IN_CHUNK).length}, rows_removed≈${removed}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const fromCsv = args.codesCsv
    ? args.codesCsv.split(/[,;/\s]+/).map((x) => str(x)).filter(Boolean)
    : [];
  const fromFile = args.codesFile ? readCodesFromFile(args.codesFile) : [];
  const fromExcel = args.codesFromExcel ? readCodesFromExcel(args.file, args.sheet) : [];

  if (!args.codesFromExcel && !args.codesCsv && !args.codesFile) {
    console.error('Provide at least one of: --codes=... | --codes-file=... | --codes-from-excel');
    process.exit(1);
  }

  const codes = mergeDeduped(fromCsv, fromFile, fromExcel);
  if (!codes.length) {
    console.error('No CardCodes resolved after merging inputs.');
    process.exit(1);
  }

  console.log(`[delete-aifm-customers-by-code] unique codes: ${codes.length}`);
  if (args.codesFromExcel) {
    console.log(`  workbook: ${path.resolve(process.cwd(), path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file))}`);
    console.log(`  sheet: "${args.sheet}"`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const rows = await fetchCustomersForCodes(supabase, codes);
  const foundCodes = new Set(rows.map((r) => str(r.customer_code)));
  const missing = codes.filter((c) => !foundCodes.has(c));
  if (missing.length) {
    console.warn(`[warn] not in DB (${missing.length}): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`);
  }

  const customerIds = rows.map((r) => r.id).filter(Boolean);
  const cadCount = await countAddressDetailsForCodes(supabase, codes);
  const jobsCount =
    customerIds.length > 0 ? await countWithIn(supabase, 'jobs', 'customer_id', customerIds) : 0;
  /** Job IDs for RESTRICT FK handling + dry-run counts. */
  let jobIdsForCustomers =
    customerIds.length > 0 ? await fetchJobIdsForCustomerIds(supabase, customerIds) : [];
  const adminMsgCount =
    jobIdsForCustomers.length > 0
      ? await countWithIn(
          supabase,
          'job_technician_admin_messages',
          'job_id',
          jobIdsForCustomers,
        )
      : 0;

  console.log('[counts] matched customers:', rows.length);
  console.log('[counts] customer_address_details rows (any deleted_at):', cadCount);
  console.log('[counts] jobs referencing those customers:', jobsCount);
  console.log('[counts] job_technician_admin_messages (RESTRICT FK; deleted before jobs):', adminMsgCount);

  if (!customerIds.length) {
    if (args.dryRun) console.log('[dry-run] nothing to delete (no matching customers).');
    else console.error('[error] nothing to delete: no rows in `customer` for the given codes.');
    process.exit(missing.length ? 1 : 0);
    return;
  }

  if (args.dryRun) {
    console.log('[dry-run] no mutations performed (shown counts are current DB snapshot).');
    process.exit(0);
    return;
  }

  if (args.confirm !== 'DELETE') {
    console.error('Refusing to delete: pass --confirm=DELETE after reviewing output (or use --dry-run first).');
    process.exit(1);
  }

  await deleteInChunksByColumn(supabase, 'customer_address_details', 'customer_code', codes);

  /** Must run before deleting customers: jobs FK is ON DELETE RESTRICT (see lib/supabase/migrations/fix_job_messages_cascade_delete.sql). */
  await deleteJobTechnicianAdminMessagesForJobIds(supabase, jobIdsForCustomers);

  await deleteInChunksByColumn(supabase, 'customer', 'customer_code', codes);

  console.log('[delete-aifm-customers-by-code] finished CASCADE deletes for matched customers.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
