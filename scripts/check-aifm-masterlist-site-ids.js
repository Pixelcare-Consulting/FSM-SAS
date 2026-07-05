/**
 * Compare deriveSiteId() (comma-shaped storage keys from aifmMasterlistDeriveSiteId.js) against customer_location.site_id.
 * Accounts for lib/supabase/migrations/backfill_strip_site_id_numeric_suffix.sql (stripped postal in DB).
 *
 * Usage:
 *   pnpm migrate:aifm-check-site-ids -- --card=C005212
 *   pnpm migrate:aifm-check-site-ids -- --file=public/sample-migration/sas_aifm_compiled_new.xlsx --card=C005212
 *   pnpm migrate:aifm-check-site-ids -- --limit=30
 */

try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config({ path: '.env' });
} catch (_) {}

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_AIFM_MASTERLIST_WORKBOOK } = require('./aifmMasterlistPaths');
const { zipFromMasterlistRow, lookupCustomerLocationRow } = require('./aifmCustomerLocationLookup');
const { deriveSiteId } = require('./aifmMasterlistDeriveSiteId');

const DEFAULT_SHEET = 'Mapped AIFM to SAP';

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function isCpPlaceholder(cardCode) {
  return /^CP\d+$/i.test(str(cardCode));
}

function isSapMasterlistLeadRow(row) {
  const raw = str(row.SAP_Source);
  if (raw && /^sap\s*leads?$/i.test(raw)) return true;
  const code = str(row.SAP_CardCode);
  if (!raw && /^L\d+/i.test(code)) return true;
  return false;
}

function parseArgs(argv) {
  const out = {
    file: DEFAULT_AIFM_MASTERLIST_WORKBOOK,
    sheet: DEFAULT_SHEET,
    card: null,
    limit: null,
  };
  for (const a of argv) {
    if (a.startsWith('--file=')) out.file = a.slice(7).trim();
    if (a.startsWith('--sheet=')) out.sheet = a.slice(8).trim();
    if (a.startsWith('--card=')) out.card = a.slice(7).trim().toUpperCase();
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const wb = XLSX.readFile(filePath);
  if (!wb.SheetNames.includes(args.sheet)) {
    console.error(`Sheet "${args.sheet}" not found. Available: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[args.sheet], { defval: '', raw: true });
  let slice = rows;
  if (args.card) {
    slice = rows.filter((r) => str(r.SAP_CardCode).toUpperCase() === args.card);
  } else if (args.limit) {
    slice = rows.slice(0, args.limit);
  }

  const codes = new Set();
  for (const row of slice) {
    if (isSapMasterlistLeadRow(row)) continue;
    const c = str(row.SAP_CardCode);
    if (c && !isCpPlaceholder(c)) codes.add(c);
  }

  const { data: customers, error: cErr } = await supabase
    .from('customer')
    .select('id, customer_code')
    .in('customer_code', [...codes])
    .is('deleted_at', null);

  if (cErr) throw cErr;

  const codeToId = new Map((customers || []).map((r) => [r.customer_code, r.id]));

  let exact = 0;
  let exactViaAlias = 0;
  let missingDb = 0;
  let noSiteInSheet = 0;

  for (const row of slice) {
    const cardCode = str(row.SAP_CardCode);
    if (!cardCode || isSapMasterlistLeadRow(row) || isCpPlaceholder(cardCode)) continue;
    if (args.card && cardCode.toUpperCase() !== args.card) continue;

    const siteId = deriveSiteId(row);
    if (!siteId) {
      noSiteInSheet++;
      console.log(`[no site in sheet] ${cardCode}`);
      continue;
    }

    const customerId = codeToId.get(cardCode);
    if (!customerId) {
      console.log(`[no customer in DB] ${cardCode} excelSiteId=${JSON.stringify(siteId)}`);
      missingDb++;
      continue;
    }

    let cl = null;
    let keyLookupError = null;
    try {
      cl = await lookupCustomerLocationRow(supabase, customerId, siteId, zipFromMasterlistRow(row), row);
    } catch (e) {
      keyLookupError = e;
    }

    if (keyLookupError) {
      console.error('lookup error', cardCode, keyLookupError.message);
      continue;
    }

    if (cl?.id) {
      if (cl.site_id === siteId) {
        exact++;
        console.log(`[MATCH] ${cardCode} ${JSON.stringify(siteId)}`);
      } else {
        exactViaAlias++;
        console.log(`[MATCH alias] ${cardCode} excel=${JSON.stringify(siteId)} db=${JSON.stringify(cl.site_id)}`);
      }
    } else {
      missingDb++;
      const { data: anySites } = await supabase
        .from('customer_location')
        .select('site_id')
        .eq('customer_id', customerId)
        .limit(20);

      console.log(`[MISS] ${cardCode} excel=${JSON.stringify(siteId)}`);
      if (anySites?.length) {
        console.log(
          `       db sample site_ids (${anySites.length} shown):`,
          anySites.map((s) => s.site_id).join(' | '),
        );
      } else {
        console.log('       (no customer_location rows for this customer)');
      }
    }
  }

  console.log('\nSummary');
  console.log(`  exact site_id match: ${exact}`);
  console.log(`  match via stripped-postal alias: ${exactViaAlias}`);
  console.log(`  excel keys with no customer_location: ${missingDb}`);
  console.log(`  rows with no deriveSiteId from sheet columns: ${noSiteInSheet}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
