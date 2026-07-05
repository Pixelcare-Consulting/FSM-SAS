#!/usr/bin/env node
/**
 * Backfill customer_location.street / building / zip from the AIFM masterlist workbook.
 *
 * Fixes rows where street was empty or duplicated site_id / building (e.g. missing "21 NASSIM ROAD").
 *
 * Usage (repo root):
 *   pnpm run aifm:backfill-customer-streets
 *   pnpm run aifm:backfill-customer-streets:dry
 *   node scripts/backfill-aifm-customer-location-streets.mjs --card=C000639
 *   node scripts/backfill-aifm-customer-location-streets.mjs --file=public/sample-migration/your.xlsx
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_AIFM_MASTERLIST_WORKBOOK } = require('./aifmMasterlistPaths');
const {
  str,
  buildMergedAddressNotesWorkQueue,
  loadCodeToId,
  lookupCustomerLocationRow,
  zipFromMasterlistRow,
} = require('./aifmMasterlistAddressNotesShared');

const DEFAULT_SHEET = 'Mapped AIFM to SAP';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    limit: null,
    file: DEFAULT_AIFM_MASTERLIST_WORKBOOK,
    sheet: DEFAULT_SHEET,
    cardCodes: [],
    verbose: false,
  };
  for (const a of argv) {
    if (a === '--dry-run' || a === '--dryrun' || a === '-n') out.dryRun = true;
    if (a === '--verbose') out.verbose = true;
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
    if (a.startsWith('--file=')) out.file = a.slice(7).trim();
    if (a.startsWith('--sheet=')) out.sheet = a.slice(8).trim();
    if (a.startsWith('--card-code=') || a.startsWith('--card=')) {
      const c = str(a.includes('--card-code=') ? a.slice('--card-code='.length) : a.slice(7));
      if (c) out.cardCodes.push(c.toUpperCase());
    }
  }
  return out;
}

function partKey(value) {
  return str(value).toLowerCase().replace(/\s+/g, ' ');
}

function resolveStreetPatch(currentStreet, excelStreet, siteId, currentBuilding) {
  const ex = str(excelStreet);
  if (!ex) return null;
  const cur = str(currentStreet);
  if (!cur || /^[-–—]+$/.test(cur)) return ex;
  const site = str(siteId);
  const bld = str(currentBuilding);
  if (site && partKey(cur) === partKey(site)) return ex;
  if (bld && partKey(cur) === partKey(bld)) return ex;
  return null;
}

function resolveBuildingPatch(currentBuilding, excelBuilding, siteId) {
  const ex = str(excelBuilding);
  if (!ex) return null;
  const cur = str(currentBuilding);
  if (!cur) return ex;
  const site = str(siteId);
  if (site && partKey(cur) === partKey(site)) return ex;
  return null;
}

function buildPatchFromExcelRow(row, existing) {
  const excelStreet = str(row.SAP_Street);
  const excelBuilding = str(row.SAP_Building);
  const excelZip = str(row.SAP_ZipCode) || str(row.SAP_Zip);
  const siteId = str(existing.site_id);

  const patch = {};
  const streetNext = resolveStreetPatch(existing.street, excelStreet, siteId, existing.building);
  if (streetNext) patch.street = streetNext;

  const buildingNext = resolveBuildingPatch(existing.building, excelBuilding, siteId);
  if (buildingNext) patch.building = buildingNext;

  if (!str(existing.zip_code) && excelZip) patch.zip_code = excelZip;

  const streetForAddress = patch.street ?? str(existing.street);
  const buildingForAddress = patch.building ?? str(existing.building);
  const combined = [streetForAddress, buildingForAddress].filter(Boolean).join(', ');
  if (combined && str(existing.address) !== combined) {
    patch.address = combined;
  }

  return Object.keys(patch).length ? patch : null;
}

async function fetchLocationRow(supabase, locationId) {
  const { data, error } = await supabase
    .from('customer_location')
    .select('id, site_id, street, building, zip_code, address, address_type')
    .eq('id', locationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  const filter = args.cardCodes.length
    ? new Set(args.cardCodes.map((c) => str(c).toUpperCase()))
    : null;

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

  const sheet = wb.Sheets[args.sheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const limited = args.limit ? rows.slice(0, args.limit) : rows;
  const workQueue = buildMergedAddressNotesWorkQueue(limited);

  const codes = new Set();
  for (const item of workQueue) {
    if (filter && !filter.has(item.cardCode.toUpperCase())) continue;
    codes.add(item.cardCode);
  }

  const codeToId = args.dryRun ? new Map() : await loadCodeToId(supabase, [...codes]);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let noLocation = 0;
  let noPatch = 0;
  let errors = 0;

  if (filter) console.log(`Filtering to: ${[...filter].join(', ')}`);
  console.log(`Workbook: ${filePath}`);
  console.log(`Merged site keys: ${workQueue.length}${args.dryRun ? ' (dry run)' : ''}`);

  for (const { cardCode, siteId, row } of workQueue) {
    if (filter && !filter.has(cardCode.toUpperCase())) {
      skipped++;
      continue;
    }

    const excelStreet = str(row.SAP_Street);
    const excelBuilding = str(row.SAP_Building);
    if (!excelStreet && !excelBuilding) {
      noPatch++;
      continue;
    }

    processed++;

    const customerId = args.dryRun ? 'dry-run-id' : codeToId.get(cardCode);
    if (!args.dryRun && !customerId) {
      noLocation++;
      if (args.verbose) console.warn(`No customer for ${cardCode}`);
      continue;
    }

    try {
      if (args.dryRun) {
        if (args.verbose) {
          console.log(
            `[dry-run] ${cardCode}\t${siteId.slice(0, 72)}\tstreet=${excelStreet || '—'}\tbuilding=${excelBuilding || '—'}`,
          );
        }
        updated++;
        continue;
      }

      const resolved = await lookupCustomerLocationRow(
        supabase,
        customerId,
        siteId,
        zipFromMasterlistRow(row),
        row,
      );
      if (!resolved?.id) {
        noLocation++;
        if (args.verbose) {
          console.warn(`No customer_location for ${cardCode} @ "${siteId.slice(0, 80)}"`);
        }
        continue;
      }

      const existing = await fetchLocationRow(supabase, resolved.id);
      if (!existing) {
        noLocation++;
        continue;
      }

      const patch = buildPatchFromExcelRow(row, existing);
      if (!patch) {
        noPatch++;
        continue;
      }

      const { error: updErr } = await supabase
        .from('customer_location')
        .update(patch)
        .eq('id', existing.id);
      if (updErr) throw new Error(updErr.message);

      updated++;
      if (args.verbose) {
        console.log(
          `✓ ${cardCode}\t${str(existing.site_id).slice(0, 56)}\t${JSON.stringify(patch)}`,
        );
      }
    } catch (err) {
      errors++;
      console.error(`${cardCode} / ${siteId}:`, err.message || err);
    }
  }

  console.log('\nDone (customer_location street/building).');
  console.log(`  Workbook rows considered: ${processed}`);
  console.log(`  Updated: ${updated}${args.dryRun ? ' (dry run — no writes)' : ''}`);
  console.log(`  No patch needed: ${noPatch}`);
  console.log(`  No customer / location match: ${noLocation}`);
  console.log(`  Skipped (filter): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
