/**
 * Import site-level Address Notes (AH) and Contact 1–3 columns (AI–AQ) from the AIFM masterlist Excel.
 *
 * Expected sheet: "Mapped AIFM to SAP" — columns:
 *   Address Notes, Contact_1_Name, Contact_1_Email, Contact_1_Phone,
 *   Contact_2_Name, Contact_2_Email, Contact_2_Phone,
 *   Contact_3_Name, Contact_3_Email, Contact_3_Phone
 *
 * Targets Supabase:
 *   - customer_address_details.address_notes (matched by customer_code + address_name / site_id)
 *   - contacts (up to 3 rows per customer_location_id; requires add_contacts_customer_location_id migration)
 *
 * Join to customer_location uses `site_id` from scripts/aifmMasterlistDeriveSiteId.js (comma-shaped storage keys).
 * Legacy dotted keys in DB still match via scripts/aifmCustomerLocationLookup.js variants.
 *
 * Prerequisites:
 *   - customer rows for SAP_CardCode (run migrate:aifm-masterlist with the **same** --file= workbook).
 *   - customer_location: required only for Contact 1–3; Address Notes still upsert to customer_address_details
 *     by (customer_code, address_name) when location is missing (customer_location_id left unset until you run masterlist).
 *
 * One-shot (same workbook for both steps): `pnpm migrate:aifm-full:latest` (runs heavy masterlist + AH–AQ).
 * **Already migrated?** Update only AH–AQ from the latest workbook: `pnpm migrate:aifm-site-notes:update`
 *
 * Usage (repo root):
 *   pnpm migrate:aifm-site-contacts-notes
 *   pnpm migrate:aifm-site-contacts-notes -- --dry-run
 *   pnpm migrate:aifm-site-contacts-notes -- --limit=50
 *   pnpm migrate:aifm-site-contacts-notes -- --file=public/sample-migration/your-compile.xlsx
 *   pnpm migrate:aifm-site-contacts-notes -- --replace-location-contacts
 *       (for each matched site: DELETE existing contacts for that customer_location_id, then insert Contact_1–3
 *        from Excel — use when DB site_id was comma-normalized or you need Excel as source of truth; destructive to portal edits)
 *
 * Address-notes-only run (same workbook semantics, no contacts):
 *   pnpm migrate:aifm-patch-address-notes
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

const DEFAULT_FILE = DEFAULT_AIFM_MASTERLIST_WORKBOOK;
const DEFAULT_SHEET = 'Mapped AIFM to SAP';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    limit: null,
    file: DEFAULT_FILE,
    sheet: DEFAULT_SHEET,
    contacts: true,
    replaceLocationContacts: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--no-contacts') out.contacts = false;
    if (a === '--replace-location-contacts') out.replaceLocationContacts = true;
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
    if (a.startsWith('--file=')) out.file = a.slice(7).trim();
    if (a.startsWith('--sheet=')) out.sheet = a.slice(8).trim();
  }
  return out;
}

function parseContactPersonName(raw) {
  const full = str(raw);
  if (!full) return { first_name: '-', middle_name: null, last_name: '-' };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      first_name: parts[0],
      middle_name: null,
      last_name: parts.slice(1).join(' '),
    };
  }
  return { first_name: parts[0], middle_name: null, last_name: '-' };
}

function contactSlotHasSignal({ name, email, phone }) {
  return !!(str(name) || str(email) || str(phone));
}

async function findExistingContact(supabase, customerId, customerLocationId, payload) {
  let q = supabase
    .from('contacts')
    .select('id')
    .eq('customer_id', customerId)
    .eq('customer_location_id', customerLocationId)
    .eq('first_name', payload.first_name)
    .eq('last_name', payload.last_name);

  if (payload.email) q = q.eq('email', payload.email);
  else q = q.is('email', null);

  if (payload.tel1) q = q.eq('tel1', payload.tel1);
  else q = q.is('tel1', null);

  const { data, error } = await q.maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(`contacts lookup: ${error.message}`);
  return data?.id ?? null;
}

async function upsertSiteContactFromSlot(
  supabase,
  customerId,
  customerLocationId,
  { name, email, phone },
  { dryRun },
) {
  if (!customerId || !customerLocationId || dryRun) return { ok: true, skipped: dryRun };

  const tel1 = str(phone) === '' ? null : str(phone);
  const emailNorm = str(email) === '' ? null : str(email);
  const names = parseContactPersonName(name);

  const hasSignal = contactSlotHasSignal({ name, email, phone });
  if (!hasSignal) return { ok: true, skipped: true };

  const payload = {
    customer_id: customerId,
    customer_location_id: customerLocationId,
    first_name: names.first_name,
    middle_name: names.middle_name,
    last_name: names.last_name,
    tel1,
    tel2: null,
    email: emailNorm,
  };

  const existingId = await findExistingContact(supabase, customerId, customerLocationId, payload);

  if (existingId) {
    const { error } = await supabase.from('contacts').update(payload).eq('id', existingId);
    if (error) throw new Error(`contacts update: ${error.message}`);
    return { ok: true, updated: true };
  }

  const { error: insErr } = await supabase.from('contacts').insert(payload);
  if (insErr && /customer_location_id|contacts_customer_location_id/i.test(insErr.message || '')) {
    const fallback = { ...payload };
    delete fallback.customer_location_id;
    const { error: e2 } = await supabase.from('contacts').insert(fallback);
    if (e2) throw new Error(`contacts insert: ${insErr.message} (fallback: ${e2.message})`);
    return { ok: true, inserted: true, warning: 'customer_location_id missing on DB; run add_contacts_customer_location_id.sql' };
  }
  if (insErr) throw new Error(`contacts insert: ${insErr.message}`);
  return { ok: true, inserted: true };
}

/** Deletes all site-scoped contacts for this location (same scope as PATCH / masterlist APIs). */
async function purgeSiteContactsForLocation(supabase, customerId, customerLocationId) {
  if (!customerLocationId || !customerId) return { removed: 0 };
  const { data, error } = await supabase
    .from('contacts')
    .delete()
    .eq('customer_id', customerId)
    .eq('customer_location_id', customerLocationId)
    .select('id');
  if (error) throw new Error(`contacts purge for location: ${error.message}`);
  return { removed: data?.length ?? 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
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

  const sheet = wb.Sheets[args.sheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const limited = args.limit ? rows.slice(0, args.limit) : rows;

  const mergedQueue = buildMergedAddressNotesWorkQueue(limited);

  const codes = new Set();
  for (const item of mergedQueue) {
    codes.add(item.cardCode);
  }

  const codeToId = args.dryRun ? new Map() : await loadCodeToId(supabase, [...codes]);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let addressRows = 0;
  let contactUpserts = 0;
  let contactWarnings = 0;
  let contactsSkippedMissingLocation = 0;
  let notesWrittenWithoutCustomerLocation = 0;
  let contactsPurgedByReplace = 0;

  for (const { cardCode, siteId, row, notes } of mergedQueue) {
    const customerId = args.dryRun ? '00000000-0000-0000-0000-000000000000' : codeToId.get(cardCode);
    if (!args.dryRun && !customerId) {
      console.warn(`No customer for ${cardCode}, skip ${siteId.slice(0, 60)}…`);
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
        console.warn(
          `No customer_location for ${cardCode} @ "${siteId}" (tried dotted key, comma-normalized variants, postal-stripped sibling, ZIP pool). ` +
            `Saving address_notes only; contacts skipped.`,
        );
      }
    }

    const notesRaw = notes;

    const slots = [
      { name: row.Contact_1_Name, email: row.Contact_1_Email, phone: row.Contact_1_Phone },
      { name: row.Contact_2_Name, email: row.Contact_2_Email, phone: row.Contact_2_Phone },
      { name: row.Contact_3_Name, email: row.Contact_3_Email, phone: row.Contact_3_Phone },
    ];

    try {
      const addrRes = await upsertAddressNotes(
        supabase,
        cardCode,
        siteId,
        customerLocationId,
        notesRaw,
        args.dryRun,
      );
      if (!addrRes.skipped && (addrRes.inserted || addrRes.updated)) addressRows++;
      if (!addrRes.skipped && (addrRes.inserted || addrRes.updated) && !customerLocationId && !args.dryRun) {
        notesWrittenWithoutCustomerLocation++;
      }

      if (args.contacts) {
        if (!customerLocationId && !args.dryRun) {
          const anyContactSignal = slots.some((s) => contactSlotHasSignal(s));
          if (anyContactSignal) contactsSkippedMissingLocation++;
        }
        if (customerLocationId || args.dryRun) {
          if (args.replaceLocationContacts && customerLocationId && !args.dryRun) {
            const { removed } = await purgeSiteContactsForLocation(
              supabase,
              customerId,
              customerLocationId,
            );
            contactsPurgedByReplace += removed;
          }
          for (const slot of slots) {
            const cr = await upsertSiteContactFromSlot(supabase, customerId, customerLocationId, slot, {
              dryRun: args.dryRun,
            });
            if (cr.warning) {
              contactWarnings++;
              console.warn(`[contacts] ${cr.warning}`);
            }
            if (cr.inserted || cr.updated) contactUpserts++;
          }
        }
      }

      processed++;
    } catch (e) {
      errors++;
      console.error(`${cardCode} / ${siteId}:`, e.message || e);
    }
  }

  console.log('\nDone (Address Notes + Contact 1–3 columns only).');
  console.log(`  Sheet rows processed (unique sites): ${processed}`);
  console.log(`  customer_address_details written: ${addressRows}${args.dryRun ? ' (dry run)' : ''}`);
  if (!args.dryRun && notesWrittenWithoutCustomerLocation) {
    console.log(
      `  address_notes rows without matching customer_location: ${notesWrittenWithoutCustomerLocation} (link FK after masterlist)`,
    );
  }
  if (args.contacts) {
    console.log(`  Contact inserts/updates: ${contactUpserts}${args.dryRun ? ' (dry run — not counted)' : ''}`);
    if (contactWarnings) console.log(`  Contact warnings: ${contactWarnings}`);
    if (!args.dryRun && args.replaceLocationContacts) {
      console.log(`  Contacts purged (--replace-location-contacts) before Excel sync: ${contactsPurgedByReplace}`);
    }
    if (!args.dryRun && contactsSkippedMissingLocation) {
      console.log(`  Contact rows skipped (no customer_location): ${contactsSkippedMissingLocation}`);
    }
  } else console.log(`  Contacts: skipped (--no-contacts)`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
