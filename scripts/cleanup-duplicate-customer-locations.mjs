#!/usr/bin/env node
/**
 * Cleanup duplicate `customer_location` rows for a customer/site/type.
 *
 * Primary safety rule: never delete a customer_location row when any active job references its `location_id`.
 * (This matches the portal DELETE API behavior.)
 *
 * Default mode is dry-run. Apply mode requires `--apply --yes`.
 *
 * Examples:
 *   node scripts/cleanup-duplicate-customer-locations.mjs --customer-code=C000446 --dry-run
 *   node scripts/cleanup-duplicate-customer-locations.mjs --customer-code=C000446 --apply --yes
 *   node scripts/cleanup-duplicate-customer-locations.mjs --customer-code=C000446 --site-id=MAIN --dry-run
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = {
    dryRun: true,
    apply: false,
    yes: false,
    customerCode: '',
    siteId: '',
    verbose: false,
    limitGroups: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--apply') out.apply = true;
    if (a === '--yes') out.yes = true;
    if (a === '--verbose') out.verbose = true;
    if (a.startsWith('--customer-code=')) out.customerCode = a.slice(16).trim();
    if (a.startsWith('--site-id=')) out.siteId = a.slice(10).trim();
    if (a.startsWith('--limit-groups=')) out.limitGroups = Math.max(0, parseInt(a.slice(15), 10) || 0);
  }
  if (out.apply) out.dryRun = false;
  return out;
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeAddressType(value) {
  const t = str(value).toUpperCase();
  if (!t) return '';
  if (t === 'B' || t === 'BO_BILLTO' || t === 'BILLTO') return 'bo_BillTo';
  if (t === 'S' || t === 'BO_SHIPTO' || t === 'SHIPTO') return 'bo_ShipTo';
  return str(value);
}

function normText(value) {
  return str(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function similarAddressKey(row) {
  // "Similar" grouping catches cases where site_id differs (suffixes, zip tails, etc),
  // but the actual address content is effectively the same.
  const type = normalizeAddressType(row.address_type);
  const street = normText(row.street);
  const building = normText(row.building);
  const address = normText(row.address);
  const zip = normText(row.zip_code);
  const country = normText(row.country_name);
  const city = normText(row.city);
  const core = [street, building, address].filter(Boolean).join('|');
  return `${type}||${core}||${zip}||${city}||${country}`;
}

async function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchCustomerByCode(supabase, customerCode) {
  const { data, error } = await supabase
    .from('customer')
    .select('id, customer_code')
    .eq('customer_code', customerCode)
    .is('deleted_at', null)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(`customer lookup: ${error.message}`);
  return data || null;
}

async function fetchCustomerLocations(supabase, customerId, siteIdFilter) {
  // Some environments have deleted_at on customer_location, some don't. Prefer filtering when present.
  const baseSelect =
    'id, customer_id, site_id, address_type, location_id, building, street, block, address, city, country_name, zip_code, created_at, updated_at, deleted_at';
  const legacySelect =
    'id, customer_id, site_id, address_type, location_id, building, street, block, address, city, country_name, zip_code';

  function buildQuery(selectList) {
    let q = supabase.from('customer_location').select(selectList).eq('customer_id', customerId);
    if (siteIdFilter) q = q.eq('site_id', siteIdFilter);
    return q;
  }

  async function execWithOptionalDeletedAt(selectList) {
    // Important: Supabase query builders are mutable; don't reuse between attempts.
    const withDel = buildQuery(selectList).is('deleted_at', null);
    let { data, error } = await withDel;
    if (error && /deleted_at/i.test(error.message || '')) {
      ({ data, error } = await buildQuery(selectList));
    }
    if (error && /column .*deleted_at/i.test(error.message || '')) {
      ({ data, error } = await buildQuery(selectList));
    }
    return { data, error };
  }

  let { data, error } = await execWithOptionalDeletedAt(baseSelect);
  if (error && /column .*customer_location\./i.test(error.message || '')) {
    // Column list mismatch (schema drift). Retry with a minimal column set.
    ({ data, error } = await execWithOptionalDeletedAt(legacySelect));
  }
  if (error && error.code !== 'PGRST116') throw new Error(`customer_location fetch: ${error.message}`);
  return data || [];
}

async function countActiveJobsForLocationId(supabase, locationId) {
  if (!locationId) return 0;
  const { count, error } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locationId)
    .is('deleted_at', null);
  if (error) throw new Error(`jobs count(location_id=${locationId}): ${error.message}`);
  return count || 0;
}

async function countContactsForCustomerLocationId(supabase, customerLocationId) {
  if (!customerLocationId) return 0;
  const { count, error } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('customer_location_id', customerLocationId);
  if (error) {
    // Legacy DBs may not have contacts.customer_location_id; ignore signal in that case.
    if (/customer_location_id/i.test(error.message || '')) return 0;
    throw new Error(`contacts count(customer_location_id=${customerLocationId}): ${error.message}`);
  }
  return count || 0;
}

async function countAddressDetailsForCustomerLocationId(supabase, customerLocationId) {
  if (!customerLocationId) return 0;
  let { count, error } = await supabase
    .from('customer_address_details')
    .select('id', { count: 'exact', head: true })
    .eq('customer_location_id', customerLocationId)
    .is('deleted_at', null);
  if (error) {
    if (/customer_address_details|customer_location_id/i.test(error.message || '')) return 0;
    throw new Error(`customer_address_details count(customer_location_id=${customerLocationId}): ${error.message}`);
  }
  return count || 0;
}

function normalizeSiteIdForGrouping(siteId) {
  const s = str(siteId);
  const suffix = ' - 1';
  if (s.endsWith(suffix)) return s.slice(0, -suffix.length);
  return s;
}

function groupKey(row) {
  const site = normalizeSiteIdForGrouping(row.site_id).toLowerCase();
  const type = normalizeAddressType(row.address_type);
  return `${site}||${type}`;
}

function pickCanonical(rowsWithSignals) {
  const sorted = [...rowsWithSignals].sort((a, b) => {
    if (b.jobCount !== a.jobCount) return b.jobCount - a.jobCount;
    if (b.contactsCount !== a.contactsCount) return b.contactsCount - a.contactsCount;
    if (b.detailsCount !== a.detailsCount) return b.detailsCount - a.detailsCount;
    const au = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (bu !== au) return bu - au;
    return String(a.id).localeCompare(String(b.id));
  });
  return sorted[0];
}

async function softDeleteAddressDetailsByFk(supabase, customerLocationId, nowIso) {
  let { error } = await supabase
    .from('customer_address_details')
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq('customer_location_id', customerLocationId)
    .is('deleted_at', null);
  if (error) {
    if (/customer_address_details|customer_location_id/i.test(error.message || '')) return { ok: true, skipped: true };
    throw new Error(`customer_address_details soft delete: ${error.message}`);
  }
  return { ok: true };
}

async function deleteContactsByFk(supabase, customerLocationId) {
  const { error } = await supabase.from('contacts').delete().eq('customer_location_id', customerLocationId);
  if (error) {
    if (/customer_location_id/i.test(error.message || '')) return { ok: true, skipped: true };
    throw new Error(`contacts delete: ${error.message}`);
  }
  return { ok: true };
}

async function deleteCustomerLocationRow(supabase, customerLocationId) {
  const { error } = await supabase.from('customer_location').delete().eq('id', customerLocationId);
  if (error) throw new Error(`customer_location delete(${customerLocationId}): ${error.message}`);
  return { ok: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.customerCode) {
    console.error('Missing required: --customer-code=C000446');
    process.exit(2);
  }

  if (args.apply && !args.yes) {
    console.error('Refusing to apply changes without --yes. Run with --apply --yes to proceed.');
    process.exit(2);
  }

  const supabase = await getSupabaseAdmin();
  const customer = await fetchCustomerByCode(supabase, args.customerCode);
  if (!customer?.id) {
    console.error(`Customer not found: ${args.customerCode}`);
    process.exit(1);
  }

  const rows = await fetchCustomerLocations(supabase, customer.id, args.siteId);
  if (rows.length === 0) {
    console.log('No customer_location rows found (nothing to do).');
    return;
  }

  const byGroup = new Map();
  for (const r of rows) {
    const key = groupKey(r);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(r);
  }

  const bySimilar = new Map();
  for (const r of rows) {
    const key = similarAddressKey(r);
    if (!bySimilar.has(key)) bySimilar.set(key, []);
    bySimilar.get(key).push(r);
  }

  const groups = [...byGroup.entries()].filter(([, list]) => (list || []).length > 1);
  if (groups.length === 0) {
    console.log('No duplicate customer_location groups found.');
    const similarGroups = [...bySimilar.entries()].filter(([, list]) => (list || []).length > 1);
    if (similarGroups.length > 0) {
      console.log(`\nNote: Found ${similarGroups.length} "similar address" group(s) where site_id differs.`);
      for (const [k, list] of similarGroups.slice(0, 15)) {
        const type = k.split('||')[0] || '';
        const sample = list[0] || {};
        console.log(
          `  - type=${type} rows=${list.length} street="${str(sample.street)}" building="${str(sample.building)}" zip="${str(sample.zip_code)}"`
        );
        for (const r of list.slice(0, 8)) {
          console.log(`      ${r.id} site_id="${str(r.site_id)}" location_id=${r.location_id || 'null'}`);
        }
        if (list.length > 8) console.log('      ...');
      }
    }
    return;
  }

  const limitedGroups = args.limitGroups ? groups.slice(0, args.limitGroups) : groups;

  console.log(`Customer: ${args.customerCode} (${customer.id})`);
  console.log(`Duplicate groups: ${groups.length}${args.limitGroups ? ` (processing first ${limitedGroups.length})` : ''}`);
  if (args.dryRun) console.log('Mode: DRY RUN (no writes)');
  else console.log('Mode: APPLY');

  let deleted = 0;
  let skippedInUse = 0;
  let skippedProtected = 0;
  let processedGroups = 0;

  for (const [key, list] of limitedGroups) {
    processedGroups++;
    const sitePart = key.split('||')[0] || '';
    const typePart = key.split('||')[1] || '';

    const enriched = [];
    for (const row of list) {
      const jobCount = await countActiveJobsForLocationId(supabase, row.location_id);
      const contactsCount = await countContactsForCustomerLocationId(supabase, row.id);
      const detailsCount = await countAddressDetailsForCustomerLocationId(supabase, row.id);
      enriched.push({ ...row, jobCount, contactsCount, detailsCount });
    }

    const canonical = pickCanonical(enriched);
    const others = enriched.filter((r) => r.id !== canonical.id);

    console.log(
      `\n[${processedGroups}/${limitedGroups.length}] site="${str(list[0]?.site_id)}" type="${typePart}" duplicates=${list.length} canonical=${canonical.id}`
    );
    if (args.verbose) {
      for (const r of enriched) {
        console.log(
          `  - ${r.id} location_id=${r.location_id || 'null'} jobs=${r.jobCount} contacts=${r.contactsCount} details=${r.detailsCount} updated_at=${r.updated_at || ''}`
        );
      }
    }

    for (const dup of others) {
      if (dup.jobCount > 0) {
        skippedInUse++;
        console.log(`  skip (in use by jobs): ${dup.id} (jobs=${dup.jobCount}, location_id=${dup.location_id})`);
        continue;
      }

      // Extra protection: don't delete the last row that has contacts/details unless it is also canonical.
      // This avoids accidentally dropping the "richer" row when data signals tie.
      if ((dup.contactsCount > 0 || dup.detailsCount > 0) && canonical.jobCount === 0) {
        const canonicalSignals = (canonical.contactsCount || 0) + (canonical.detailsCount || 0);
        const dupSignals = (dup.contactsCount || 0) + (dup.detailsCount || 0);
        if (dupSignals > canonicalSignals) {
          skippedProtected++;
          console.log(
            `  skip (protected richer row): ${dup.id} (contacts=${dup.contactsCount}, details=${dup.detailsCount})`
          );
          continue;
        }
      }

      if (args.dryRun) {
        console.log(`  would delete: ${dup.id}`);
        continue;
      }

      const nowIso = new Date().toISOString();
      await softDeleteAddressDetailsByFk(supabase, dup.id, nowIso);
      await deleteContactsByFk(supabase, dup.id);
      await deleteCustomerLocationRow(supabase, dup.id);
      deleted++;
      console.log(`  deleted: ${dup.id}`);
    }
  }

  console.log('\nDone.');
  console.log(`  Groups processed: ${processedGroups}`);
  console.log(`  Deleted duplicate rows: ${deleted}`);
  console.log(`  Skipped (in-use by jobs): ${skippedInUse}`);
  console.log(`  Skipped (protected): ${skippedProtected}`);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});

