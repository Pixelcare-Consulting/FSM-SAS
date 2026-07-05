/**
 * Patch only `customer_address_details.address_notes` from the AIFM masterlist workbook (column AH /
 * flexible "Address Notes" headers). Does not touch contacts or other tables.
 *
 * Sample card for smoke tests (`Mapped AIFM → SAP`): **C000639** — workbook usually has AH on some sites for
 * that code. Use `--card-code=` / `--card=` to narrow; cards with blank AH everywhere are intentionally skipped.
 *
 * Default: skips rows where Excel has no notes (avoids overwriting DB with NULL). Pass --patch-empty-rows
 * to apply empty cells too (matches the behaviour of migrate:aifm-site-contacts-notes).
 *
 * Usage (repo root, pnpm):
 *   pnpm migrate:aifm-patch-address-notes
 *   pnpm migrate:aifm-patch-address-notes -- --dry-run
 *   pnpm migrate:aifm-patch-address-notes:sample639   <- one-shot: C000639 + verbose (--file= overrides default)
 *   pnpm migrate:aifm-patch-address-notes -- --file=public/sample-migration/your.xlsx
 *   pnpm migrate:aifm-patch-address-notes -- --card=C000639
 *   pnpm migrate:aifm-patch-address-notes -- --card-code=C000639   (alias for --card=)
 *   pnpm migrate:aifm-patch-address-notes -- --verbose
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
const {
  str,
  upsertAddressNotes,
  zipFromMasterlistRow,
  lookupCustomerLocationRow,
  loadCodeToId,
  buildMergedAddressNotesWorkQueue,
} = require('./aifmMasterlistAddressNotesShared');

const DEFAULT_SHEET = 'Mapped AIFM to SAP';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    skipIfExcelNotesEmpty: true,
    limit: null,
    file: DEFAULT_AIFM_MASTERLIST_WORKBOOK,
    sheet: DEFAULT_SHEET,
    cardCodes: [],
    verbose: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--patch-empty-rows') out.skipIfExcelNotesEmpty = false;
    if (a === '--verbose') out.verbose = true;
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
    if (a.startsWith('--file=')) out.file = a.slice(7).trim();
    if (a.startsWith('--sheet=')) out.sheet = a.slice(8).trim();
    if (a.startsWith('--card-code=')) {
      const c = str(a.slice('--card-code='.length));
      if (c) out.cardCodes.push(c.toUpperCase());
    } else if (a.startsWith('--card=')) {
      const c = str(a.slice(7));
      if (c) out.cardCodes.push(c.toUpperCase());
    }
  }
  return out;
}

function cardFilterSet(cardCodes) {
  if (!cardCodes?.length) return null;
  return new Set(cardCodes.map((x) => str(x).toUpperCase()).filter(Boolean));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  const filter = cardFilterSet(args.cardCodes);

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

  const workQueueAll = buildMergedAddressNotesWorkQueue(limited);

  const codes = new Set();
  for (const item of workQueueAll) {
    if (filter && !filter.has(item.cardCode.toUpperCase())) continue;
    codes.add(item.cardCode);
  }

  const codeToId = args.dryRun ? new Map() : await loadCodeToId(supabase, [...codes]);

  let processed = 0;
  let skipped = 0;
  let skippedEmptyExcelNotes = 0;
  let errors = 0;
  let inserts = 0;
  let updates = 0;
  let notesWithoutLocation = 0;

  if (filter) {
    console.log(`Filtering to card code(s): ${[...filter].join(', ')}`);
  }
  console.log(`Workbook: ${filePath}`);
  console.log(`Sheet: ${args.sheet}`);
  console.log(`Unique CardCode+site keys after merging duplicate workbook lines: ${workQueueAll.length}`);
  if (filter) {
    const forFilter = workQueueAll.filter((it) => filter.has(it.cardCode.toUpperCase()));
    const withAh = forFilter.filter((it) => str(it.notes) !== '').length;
    console.log(
      `For filtered card code(s): ${forFilter.length} site key(s); ${withAh} with non-empty Address Notes (AH)`,
    );
    if (withAh === 0 && args.skipIfExcelNotesEmpty) {
      console.log(
        '(Nothing to sync: patch skips blank AH by default — add notes to column AH or use UI / --patch-empty-rows only if intentionally clearing)',
      );
    }
  }
  console.log(`${args.skipIfExcelNotesEmpty ? 'Skipping' : 'Applying'} rows with blank Excel address notes`);

  for (const { cardCode, siteId, row, notes: notesRaw } of workQueueAll) {
    if (filter && !filter.has(cardCode.toUpperCase())) {
      skipped++;
      continue;
    }

    if (args.skipIfExcelNotesEmpty && str(notesRaw) === '') {
      skippedEmptyExcelNotes++;
      continue;
    }

    const customerId = args.dryRun ? '00000000-0000-0000-0000-000000000000' : codeToId.get(cardCode);
    if (!args.dryRun && !customerId) {
      console.warn(`No customer for ${cardCode}, skip ${siteId.slice(0, 72)}`);
      skipped++;
      continue;
    }

    let customerLocationId = null;
    if (!args.dryRun) {
      try {
        const resolvedLoc = await lookupCustomerLocationRow(
          supabase,
          customerId,
          siteId,
          zipFromMasterlistRow(row),
          row,
        );
        customerLocationId = resolvedLoc?.id ?? null;
      } catch (lookupErr) {
        errors++;
        console.error(`${cardCode} / ${siteId}:`, lookupErr.message || lookupErr);
        continue;
      }
      if (!customerLocationId) {
        if (args.verbose) {
          console.warn(
            `No customer_location for ${cardCode} @ "${siteId.slice(0, 96)}" — still upsert address_notes`,
          );
        }
      }
    }

    try {
      const addrRes = await upsertAddressNotes(supabase, cardCode, siteId, customerLocationId, notesRaw, args.dryRun);
      if (!addrRes.dry && addrRes.updated) updates++;
      if (!addrRes.dry && addrRes.inserted) inserts++;
      if (!addrRes.dry && (addrRes.inserted || addrRes.updated) && !customerLocationId) {
        notesWithoutLocation++;
      }
      if (args.verbose && (addrRes.dry || addrRes.updated || addrRes.inserted)) {
        const verb = addrRes.dry ? 'dry-run' : addrRes.inserted ? 'insert' : addrRes.updated ? 'update' : 'noop';
        const notePreview =
          str(notesRaw).length > 72 ? `${str(notesRaw).slice(0, 72)}…` : str(notesRaw) || '(empty → null)';
        console.log(`${verb}\t${cardCode}\t${siteId.slice(0, 80)}\t"${notePreview}"`);
      }
      processed++;
    } catch (e) {
      errors++;
      console.error(`${cardCode} / ${siteId}:`, e.message || e);
    }
  }

  console.log('\nDone (address_notes only).');
  console.log(`  Unique sites processed: ${processed}${args.dryRun ? ' (dry run)' : ''}`);
  if (!args.skipIfExcelNotesEmpty) {
    console.log(`  (Included rows with blank AH — nullable address_notes)`);
  } else {
    console.log(`  Skipped (blank Excel Address Notes column): ${skippedEmptyExcelNotes}`);
  }
  if (!args.dryRun) {
    console.log(`  customer_address_details updated: ${updates}`);
    console.log(`  customer_address_details inserted: ${inserts}`);
    if (notesWithoutLocation) {
      console.log(
        `  writes without matched customer_location: ${notesWithoutLocation} — UI joins may depend on FK; re-run masterlist if needed.`,
      );
    }
  }
  console.log(
    filter
      ? `  Skipped (other card codes, not matching --card / --card-code): ${skipped}`
      : `  Other skipped rows: ${skipped}`,
  );
  console.log(`  Errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
