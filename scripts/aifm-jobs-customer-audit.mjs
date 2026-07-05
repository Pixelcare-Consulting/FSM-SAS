#!/usr/bin/env node
/**
 * AIFM jobs customer audit (log-only, Phase 1).
 *
 * Paginates jobs, resolves account names via id_customer + /api/v1/customers,
 * optional SAP Service Layer lookup (Customers C, then Leads L).
 *
 * Outputs (gitignored):
 *   logs/aifm/aifm-jobs-{start}-{end}-{timestamp}.txt
 *   logs/aifm/aifm-jobs-{start}-{end}-{timestamp}.jsonl
 *   logs/aifm/aifm-jobs-{start}-{end}-{timestamp}.fsm.jsonl  (import-jobs-shaped preview)
 *
 * Usage:
 *   node scripts/aifm-jobs-customer-audit.mjs --start=2026-05-01 --end=2026-05-31
 *   node scripts/aifm-jobs-customer-audit.mjs --start=2026-05-01 --end=2026-05-31 --job=236127,235912
 *   node scripts/aifm-jobs-customer-audit.mjs --start=2026-05-01 --end=2026-05-31 --skip-sap
 *   node scripts/aifm-jobs-customer-audit.mjs --start=2026-05-01 --end=2026-05-31 --apply-masterlist
 *
 * Env: AIFM_API_TOKEN, optional AIFM_BASE_URL
 * SAP: SAP_SERVICE_LAYER_BASE_URL, SAP_B1_COMPANY_DB, SAP_B1_USERNAME, SAP_B1_PASSWORD
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { createRequire } = await import('module');
  createRequire(import.meta.url)('dotenv').config({ path: '.env.local' });
} catch {
  // optional
}

import {
  authorizeAifmBearer,
  buildAifmCustomerDirectoryMap,
  fetchAifmCustomersDirectory,
  fetchAllAifmJobsInRange,
} from '../lib/integrations/aifmApiClient.js';
import {
  buildFsmImportPreview,
  buildJobAuditRecord,
  formatJobAuditLogLine,
} from '../lib/integrations/aifmCustomerSapResolver.js';
import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../lib/services/sapService.js';
import { syncSapHitsToMasterlist } from '../lib/integrations/aifmSapMasterlistSync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', 'logs', 'aifm');

function parseArgs(argv) {
  const out = {
    start: null,
    end: null,
    jobIds: null,
    skipSap: false,
    applyMasterlist: false,
    maxPages: 100,
  };
  for (const arg of argv) {
    if (arg.startsWith('--start=')) out.start = arg.slice('--start='.length).trim();
    else if (arg.startsWith('--end=')) out.end = arg.slice('--end='.length).trim();
    else if (arg.startsWith('--job=')) {
      out.jobIds = new Set(
        arg
          .slice('--job='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (arg === '--skip-sap') out.skipSap = true;
    else if (arg === '--apply-masterlist') out.applyMasterlist = true;
    else if (arg.startsWith('--max-pages=')) {
      out.maxPages = Math.max(1, parseInt(arg.slice('--max-pages='.length), 10) || 100);
    }
  }
  return out;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function summarize(records) {
  const s = {
    total: records.length,
    missingIdCustomer: 0,
    missingDirectoryRow: 0,
    missingAccountName: 0,
    contactDiffersFromAccount: 0,
    sapCustomerHit: 0,
    sapLeadHit: 0,
    noSapMatch: 0,
    sapSkipped: 0,
  };
  for (const r of records) {
    if (!r.idCustomer) s.missingIdCustomer++;
    if (r.idCustomer && !r.accountRowPresent) s.missingDirectoryRow++;
    if (r.idCustomer && r.accountRowPresent && !r.accountName) s.missingAccountName++;
    if (r.contactDiffersFromAccount) s.contactDiffersFromAccount++;
    if (r.notes?.includes('sap_skipped')) s.sapSkipped++;
    else if (r.sapCardType === 'C') s.sapCustomerHit++;
    else if (r.sapCardType === 'L') s.sapLeadHit++;
    else if (r.accountName && !r.sapCardCode) s.noSapMatch++;
  }
  return s;
}

function formatSummary(summary, meta) {
  const lines = [
    '',
    '=== Summary ===',
    `Range: ${meta.start} → ${meta.end}`,
    `Jobs fetched: ${meta.jobsFetched} (${meta.pagesFetched} page(s))`,
    `Directory rows: ${meta.directorySize}`,
    `Audit records: ${summary.total}`,
    `Missing id_customer: ${summary.missingIdCustomer}`,
    `Missing directory row: ${summary.missingDirectoryRow}`,
    `Missing account customer_name: ${summary.missingAccountName}`,
    `Job contact ≠ account name: ${summary.contactDiffersFromAccount}`,
    `SAP Customer (C) hit: ${summary.sapCustomerHit}`,
    `SAP Lead (L) hit: ${summary.sapLeadHit}`,
    `No SAP match (with account name): ${summary.noSapMatch}`,
    `SAP skipped: ${summary.sapSkipped}`,
  ];
  if (meta.sapLoginError) lines.push(`SAP login: FAILED — ${meta.sapLoginError}`);
  else if (!meta.skipSap) lines.push('SAP login: OK');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.start || !args.end) {
    console.error(
      'Usage: node scripts/aifm-jobs-customer-audit.mjs --start=YYYY-MM-DD --end=YYYY-MM-DD [--job=id,...] [--skip-sap]'
    );
    process.exit(1);
  }

  const apiToken = (process.env.AIFM_API_TOKEN || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!apiToken) {
    console.error('AIFM_API_TOKEN is not set.');
    process.exit(1);
  }

  console.log(`Authorizing AIFM (${args.start} → ${args.end})…`);
  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, apiToken);
  if (!auth) {
    console.error('AIFM authorization failed.');
    process.exit(1);
  }
  const { base, bearer } = auth;

  console.log('Fetching jobs (paginated)…');
  const jobResult = await fetchAllAifmJobsInRange(base, bearer, args.start, args.end, {
    maxPages: args.maxPages,
  });
  if (jobResult.error) {
    console.error(jobResult.error);
    process.exit(1);
  }

  let jobs = jobResult.jobs;
  if (args.jobIds?.size) {
    jobs = jobs.filter((j) => args.jobIds.has(String(j.id)));
    console.log(`Filtered to ${jobs.length} job(s) by --job`);
  }
  console.log(`Jobs: ${jobs.length} (${jobResult.pagesFetched} page(s) scanned)`);

  console.log('Downloading AIFM customer directory…');
  const directoryRows = await fetchAifmCustomersDirectory(base, bearer);
  const directoryMap = buildAifmCustomerDirectoryMap(directoryRows || []);
  console.log(`Directory: ${directoryMap.size} customer row(s)`);

  let sessionCookies = null;
  let sapLoginError = null;
  if (!args.skipSap) {
    try {
      const sapLogin = await loginSessionCookiesFromEnvironment();
      sessionCookies = unwrapSapEnvironmentLogin(sapLogin);
      if (!sessionCookies) {
        sapLoginError = sapLogin?.error || 'login returned no session cookies (check SAP_* env vars)';
      }
    } catch (err) {
      sapLoginError = err?.message || String(err);
    }
    if (sapLoginError) {
      console.warn(`SAP login failed: ${sapLoginError} — continuing without SAP lookups`);
    } else {
      console.log('SAP Service Layer session OK');
    }
  }

  const sapCache = new Map();
  const records = [];
  const fsmPreviews = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const record = await buildJobAuditRecord(job, directoryMap, sessionCookies, {
      skipSap: args.skipSap || !sessionCookies,
      sapCache,
    });
    records.push(record);
    fsmPreviews.push(buildFsmImportPreview(job, record));
    if ((i + 1) % 25 === 0 || i === jobs.length - 1) {
      console.log(`Audited ${i + 1}/${jobs.length}`);
    }
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = stamp();
  const baseName = `aifm-jobs-${args.start}-${args.end}-${ts}`;
  const txtPath = path.join(LOG_DIR, `${baseName}.txt`);
  const jsonlPath = path.join(LOG_DIR, `${baseName}.jsonl`);
  const fsmJsonlPath = path.join(LOG_DIR, `${baseName}.fsm.jsonl`);

  const summary = summarize(records);
  const meta = {
    start: args.start,
    end: args.end,
    jobsFetched: jobs.length,
    pagesFetched: jobResult.pagesFetched,
    directorySize: directoryMap.size,
    skipSap: args.skipSap,
    sapLoginError,
  };

  const header = [
    `AIFM customer audit`,
    `Generated: ${new Date().toISOString()}`,
    `Range: ${args.start} → ${args.end}`,
    `Jobs: ${jobs.length}`,
    '',
    'Columns: AIFM id | id_customer | job_contact | account | SAP | suggested | notes',
    '',
  ].join('\n');

  const body = records.map((r) => formatJobAuditLogLine(r)).join('\n');
  const summaryBlock = formatSummary(summary, meta);
  fs.writeFileSync(txtPath, `${header}${body}${summaryBlock}\n`, 'utf8');

  const jsonlLines = records.map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(
    jsonlPath,
    `${JSON.stringify({ type: 'meta', ...meta, summary })}\n${jsonlLines}\n`,
    'utf8'
  );

  const fsmJsonlLines = fsmPreviews.map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(
    fsmJsonlPath,
    `${JSON.stringify({ type: 'meta', format: 'fsm-import-preview-v1', ...meta, summary })}\n${fsmJsonlLines}\n`,
    'utf8'
  );

  console.log(summaryBlock);
  console.log(`\nWrote:\n  ${txtPath}\n  ${jsonlPath}\n  ${fsmJsonlPath}`);

  if (args.applyMasterlist && !args.skipSap && sessionCookies) {
    const hits = records
      .filter((r) => r.suggestedCardCode)
      .map((r) => ({
        cardCode: r.suggestedCardCode,
        cardName: r.sapCardName || r.accountName,
        cardType: r.sapCardType,
        accountName: r.accountName,
      }));
    if (!hits.length) {
      console.log('\n--apply-masterlist: no SAP CardCode hits in this audit run.');
    } else {
      console.log(`\n--apply-masterlist: syncing ${hits.length} SAP hit(s) to Supabase…`);
      const syncSummary = await syncSapHitsToMasterlist(hits, { sessionCookies });
      console.log(JSON.stringify(syncSummary, null, 2));
    }
  } else if (args.applyMasterlist) {
    console.warn('\n--apply-masterlist skipped: SAP session unavailable or --skip-sap set');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
