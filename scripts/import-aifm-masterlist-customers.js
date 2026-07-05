/**
 * Import customers + service locations from the compiled AIFM → SAP masterlist Excel.
 *
 * Sheet: "Mapped AIFM to SAP". Default workbook: scripts/aifmMasterlistPaths.js (override with --file=).
 *
 * Aligns with job migration / CreateJobs patterns:
 *   - customer.customer_code = SAP_CardCode (rejects CP… placeholder codes)
 *   - One locations row per distinct site **and** address type (B/S). Bill-to + ship-to at the same unit are both kept.
 *     Keys come from scripts/aifmMasterlistDeriveSiteId.js: SAP-style nick/parts,
 *     then commas for type+zip tails (stored shape like `#02-03 SITE, 258379` — see commaSapSeparatorStyle).
 *   - Contacts: optional per site from AIFM name + SAP/AIFM phones/email, keyed by
 *     (customer_id, customer_location_id, first/last, email). Multiple contacts per customer
 *     across locations; multiple at one location if names/emails differ. Use --no-contacts to skip.
 *   - customer_location links customer ↔ SAP-style address fields ↔ locations.id
 *   - customer_address_details with address_name = site_id (matches backfill + APIs)
 *   - customer.source = 'sap'
 *   - Rows tagged SAP_Source = SAP Lead / CardCode L* (no tag) go to sap_lead via pnpm migrate:aifm-sap-leads — skipped here.
 *
 * Usage (repo root):
 *   pnpm migrate:aifm-masterlist
 *   pnpm migrate:aifm-masterlist -- --dry-run
 *   pnpm migrate:aifm-masterlist -- --limit=100
 *   pnpm migrate:aifm-masterlist -- --file=…   (must match migrate:aifm-site-contacts-notes workbook)
 *   pnpm migrate:aifm-full:latest              (masterlist + site-notes; defaults to latest submitted xlsx)
 *   pnpm migrate:aifm-masterlist -- --update-customer   (refresh name/phone/email for existing customers)
 *   pnpm migrate:aifm-masterlist -- --no-contacts       (do not upsert contacts table)
 *
 * DB: run lib/supabase/migrations/add_contacts_customer_location_id.sql so contacts can be tied to a site.
 *
 * Existing rows with ` · <digits>` suffix: optional
 * lib/supabase/migrations/backfill_strip_site_id_numeric_suffix.sql
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
const { sapAdresType } = require('./aifmMasterlistRowFields');
const {
  siteKeyVariants,
  customerLocationCacheKey,
  normalizeAddressTypeCacheKey,
  addressDetailsStorageName,
} = require('./aifmCustomerLocationLookup');
const { deriveSiteId } = require('./aifmMasterlistDeriveSiteId');

const DEFAULT_FILE = DEFAULT_AIFM_MASTERLIST_WORKBOOK;
const DEFAULT_SHEET = 'Mapped AIFM to SAP';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    limit: null,
    file: DEFAULT_FILE,
    sheet: DEFAULT_SHEET,
    updateCustomer: false,
    contacts: true,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--update-customer') out.updateCustomer = true;
    if (a === '--no-contacts') out.contacts = false;
    if (a.startsWith('--limit=')) out.limit = Math.max(0, parseInt(a.slice(8), 10) || 0);
    if (a.startsWith('--file=')) out.file = a.slice(7).trim();
    if (a.startsWith('--sheet=')) out.sheet = a.slice(8).trim();
  }
  return out;
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function isCpPlaceholder(cardCode) {
  return /^CP\d+$/i.test(str(cardCode));
}

/** Excel masterlist rows for SAP B1 leads (see import-aifm-masterlist-sap-leads.js); do not store in customer. */
function isSapMasterlistLeadRow(row) {
  const raw = str(row.SAP_Source);
  if (raw && /^sap\s*leads?$/i.test(raw)) return true;
  const code = str(row.SAP_CardCode);
  if (!raw && /^L\d+/i.test(code)) return true;
  return false;
}

/** Same shaping as pages/api/jobs/migration/apply.js formatAddressLikeServiceLocationTab */
function formatAddressLikeServiceLocationTab(addr) {
  const country =
    addr?.Country === 'SG' ? 'Singapore' : addr?.Country || addr?.CountryName || '';
  const parts = [
    addr?.Street,
    addr?.BuildingFloorRoom || addr?.Building,
    addr?.Block,
    addr?.City,
    country,
    addr?.ZipCode,
  ].filter(Boolean);
  return parts.join(', ') || addr?.AddressName || null;
}

function rowToAddr(row, siteId) {
  return {
    Street: str(row.SAP_Street),
    Building: str(row.SAP_Building),
    BuildingFloorRoom: str(row.SAP_Building),
    Block: null,
    City: str(row.SAP_City),
    ZipCode: str(row.SAP_ZipCode),
    Country: str(row.SAP_Country) || 'SG',
    AddressType: sapAdresType(row) || null,
    AddressName: siteId,
    CountryName: str(row.SAP_Country) === 'SG' ? 'Singapore' : str(row.SAP_Country) || null,
  };
}

function contactNamesFromRow(row) {
  let first = str(row.AIFM_FirstName);
  let last = str(row.AIFM_LastName);
  const prefix = str(row.AIFM_Prefix);

  if (!first && !last) {
    const full = str(row.AIFM_Name);
    if (full) {
      const parts = full.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        first = parts[0];
        last = parts.slice(1).join(' ');
      } else if (parts.length === 1) {
        first = parts[0];
        last = '-';
      }
    }
  }

  if (!first) first = '-';
  if (!last) last = '-';

  const middle_name = prefix !== '' ? prefix : null;
  return { first_name: first, middle_name: middle_name, last_name: last };
}

function hasContactSignal(row) {
  const names = contactNamesFromRow(row);
  const hasName = names.first_name !== '-' || names.last_name !== '-';
  const phone =
    str(row.SAP_Phone1) ||
    str(row.AIFM_Phone) ||
    str(row.SAP_Phone2) ||
    str(row.SAP_Cellular);
  const email = str(row.SAP_Email) || str(row.AIFM_Email);
  return hasName || !!phone || !!email;
}

/**
 * One or more contacts per customer: differentiated by customer_location_id + identity fields.
 * Re-runs update the same row when first/last/email match for that site.
 */
async function upsertSiteContact(supabase, customerId, customerLocationId, row, { dryRun, contactsEnabled }) {
  if (!contactsEnabled || !customerId || !customerLocationId || dryRun) return { ok: true, skipped: true };
  if (!hasContactSignal(row)) return { ok: true, skipped: true };

  const names = contactNamesFromRow(row);
  const tel1 = str(row.SAP_Phone1) || str(row.AIFM_Phone) || null;
  const tel2 = str(row.SAP_Phone2) || str(row.SAP_Cellular) || null;
  const email = str(row.SAP_Email) || str(row.AIFM_Email) || null;

  const payload = {
    customer_id: customerId,
    customer_location_id: customerLocationId,
    first_name: names.first_name,
    middle_name: names.middle_name,
    last_name: names.last_name,
    tel1: tel1 || null,
    tel2: tel2 || null,
    email: email || null,
  };

  let q = supabase
    .from('contacts')
    .select('id')
    .eq('customer_id', customerId)
    .eq('customer_location_id', customerLocationId)
    .eq('first_name', names.first_name)
    .eq('last_name', names.last_name);
  if (email) q = q.eq('email', email);
  else q = q.is('email', null);

  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr && findErr.code !== 'PGRST116') {
    throw new Error(`contacts lookup: ${findErr.message}`);
  }

  if (existing?.id) {
    const { error: upErr } = await supabase.from('contacts').update(payload).eq('id', existing.id);
    if (upErr) throw new Error(`contacts update: ${upErr.message}`);
    return { ok: true, updated: true };
  }

  const { error: insErr } = await supabase.from('contacts').insert(payload);
  if (insErr && /customer_location_id|contacts_customer_location_id/i.test(insErr.message || '')) {
    const fallback = { ...payload };
    delete fallback.customer_location_id;
    const { error: e2 } = await supabase.from('contacts').insert(fallback);
    if (e2) throw new Error(`contacts insert: ${insErr.message} (no FK column: ${e2.message})`);
    return { ok: true, inserted: true, warning: 'customer_location_id column missing; run add_contacts_customer_location_id migration' };
  }
  if (insErr) throw new Error(`contacts insert: ${insErr.message}`);
  return { ok: true, inserted: true };
}

function latLngFromRow(row) {
  const latRaw = row.AIFM_LOC_Latitude;
  const lngRaw = row.AIFM_LOC_Longitude;
  if (latRaw === '' || latRaw === null || lngRaw === '' || lngRaw === null) return { lat: null, lng: null };
  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw).trim());
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null };
  return { lat: String(lat), lng: String(lng) };
}

async function saveAddressDetails(supabase, cardCode, siteId, addr, customerLocationId) {
  if (!cardCode || !siteId) return;

  /** @type {{ id: string; address_name?: string; address_notes?: string | null } | null} */
  let existing = null;

  if (customerLocationId) {
    const { data: fkRows, error: fkErr } = await supabase
      .from('customer_address_details')
      .select('id, address_name, address_notes')
      .eq('customer_code', cardCode)
      .eq('customer_location_id', customerLocationId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(80);
    if (fkErr && fkErr.code !== 'PGRST116') {
      console.warn('[saveAddressDetails] FK enumerate:', fkErr.message);
    }
    const pool = fkRows || [];
    if (pool.length === 1) {
      [existing] = pool;
    } else if (pool.length > 1) {
      const variantKeys = new Set(siteKeyVariants(siteId).map((x) => str(x)));
      existing =
        pool.find((r) => variantKeys.has(str(r.address_name))) ||
        pool.find((r) => r.address_notes != null && str(String(r.address_notes).trim())) ||
        pool[0];
    }
  }

  let canonicalSiteId = siteId;
  if (customerLocationId) {
    const { data: cl, error: clErr } = await supabase
      .from('customer_location')
      .select('site_id')
      .eq('id', customerLocationId)
      .maybeSingle();
    if (clErr && clErr.code !== 'PGRST116') {
      console.warn('[saveAddressDetails] site_id:', clErr.message);
    } else {
      const sid = str(cl?.site_id);
      if (sid) canonicalSiteId = sid;
    }
  }

  const storageAddressName = addressDetailsStorageName(canonicalSiteId, addr?.AddressType);

  if (!existing?.id) {
    const nameCandidates = uniqStrings([
      storageAddressName,
      ...siteKeyVariants(canonicalSiteId).map((v) =>
        addressDetailsStorageName(v, addr?.AddressType)
      ),
    ]);
    for (const variant of nameCandidates) {
      const { data, error } = await supabase
        .from('customer_address_details')
        .select('id, address_name, customer_location_id')
        .eq('customer_code', cardCode)
        .eq('address_name', variant)
        .is('deleted_at', null)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('[saveAddressDetails] lookup:', error.message);
        break;
      }
      if (data?.id) {
        if (
          customerLocationId &&
          data.customer_location_id &&
          String(data.customer_location_id) !== String(customerLocationId)
        ) {
          continue;
        }
        existing = data;
        break;
      }
    }
  }

  if (existing?.id) {
    const patch = {
      address_type: addr?.AddressType || null,
      status: 'Active',
      updated_at: new Date().toISOString(),
    };
    if (customerLocationId) patch.customer_location_id = customerLocationId;
    const { error: upErr } = await supabase.from('customer_address_details').update(patch).eq('id', existing.id);
    if (upErr) console.warn('[saveAddressDetails] update:', upErr.message);
    return;
  }

  const insertPayload = {
    customer_code: cardCode,
    address_name: storageAddressName,
    address_type: addr?.AddressType || null,
    status: 'Active',
    updated_at: new Date().toISOString(),
  };
  if (customerLocationId) insertPayload.customer_location_id = customerLocationId;

  const { error: insErr } = await supabase.from('customer_address_details').insert(insertPayload);
  if (insErr) console.warn('[saveAddressDetails] insert:', insErr.message);
}

function uniqStrings(list) {
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const t = str(x);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function loadCustomerLocationCache(supabase, customerIds) {
  const map = new Map();
  const chunk = 80;
  for (let i = 0; i < customerIds.length; i += chunk) {
    const slice = customerIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from('customer_location')
      .select('id, customer_id, site_id, location_id, address_type')
      .in('customer_id', slice);
    if (error) throw error;
    for (const r of data || []) {
      if (r.site_id) {
        map.set(customerLocationCacheKey(r.customer_id, r.site_id, r.address_type), r);
      }
    }
  }
  return map;
}

async function ensureLocationAndCustomerLocation({
  supabase,
  customerId,
  cardCode,
  siteId,
  addr,
  lat,
  lng,
  dryRun,
  clCache,
}) {
  const cacheKey = customerLocationCacheKey(customerId, siteId, addr.AddressType);
  let clRow = clCache.get(cacheKey);
  const locationName = formatAddressLikeServiceLocationTab(addr) || '—';

  if (dryRun) {
    return { locationId: clRow?.location_id ?? null, customerLocationId: clRow?.id ?? null };
  }

  if (!clRow) {
    const locInsert = {
      customer_id: customerId,
      location_name: locationName,
    };
    if (lat) {
      locInsert.current_latitude = lat;
      locInsert.destination_latitude = lat;
    }
    if (lng) {
      locInsert.current_longitude = lng;
      locInsert.destination_longitude = lng;
    }

    const { data: loc, error: locErr } = await supabase
      .from('locations')
      .insert(locInsert)
      .select('id')
      .single();
    if (locErr) throw new Error(`locations insert: ${locErr.message}`);

    const countryName = addr.Country === 'SG' ? 'Singapore' : addr.Country || addr.CountryName || null;
    const clPayload = {
      customer_id: customerId,
      site_id: siteId,
      building: addr.Building || addr.BuildingFloorRoom || null,
      street: addr.Street || null,
      block: addr.Block || null,
      city: addr.City || null,
      country_name: countryName,
      zip_code: addr.ZipCode || null,
      address_type: addr.AddressType || null,
      address: [addr.Street, addr.Building].filter(Boolean).join(', ') || null,
      location_id: loc.id,
    };

    const { data: ins, error: insErr } = await supabase
      .from('customer_location')
      .insert(clPayload)
      .select('id, location_id')
      .single();
    if (insErr) {
      const fallback = { ...clPayload };
      delete fallback.location_id;
      const { data: ins2, error: e2 } = await supabase
        .from('customer_location')
        .insert(fallback)
        .select('id, location_id')
        .single();
      if (e2) throw new Error(`customer_location insert: ${insErr.message}; without location_id: ${e2.message}`);
      clRow = { id: ins2.id, customer_id: customerId, site_id: siteId, location_id: ins2.location_id ?? loc.id };
      if (!ins2.location_id) {
        await supabase.from('customer_location').update({ location_id: loc.id }).eq('id', ins2.id);
        clRow.location_id = loc.id;
      }
    } else {
      clRow = { id: ins.id, customer_id: customerId, site_id: siteId, location_id: ins.location_id };
    }
    clCache.set(cacheKey, clRow);
  } else if (!clRow.location_id) {
    const locInsert = {
      customer_id: customerId,
      location_name: locationName,
    };
    if (lat) {
      locInsert.current_latitude = lat;
      locInsert.destination_latitude = lat;
    }
    if (lng) {
      locInsert.current_longitude = lng;
      locInsert.destination_longitude = lng;
    }
    const { data: loc, error: locErr } = await supabase
      .from('locations')
      .insert(locInsert)
      .select('id')
      .single();
    if (locErr) throw new Error(`locations insert (link legacy customer_location): ${locErr.message}`);

    const countryName = addr.Country === 'SG' ? 'Singapore' : addr.Country || addr.CountryName || null;
    await supabase
      .from('customer_location')
      .update({
        building: addr.Building || addr.BuildingFloorRoom || null,
        street: addr.Street || null,
        block: addr.Block || null,
        city: addr.City || null,
        country_name: countryName,
        zip_code: addr.ZipCode || null,
        address_type: addr.AddressType || null,
        address: [addr.Street, addr.Building].filter(Boolean).join(', ') || null,
        location_id: loc.id,
      })
      .eq('id', clRow.id);
    clRow = { ...clRow, location_id: loc.id };
    clCache.set(cacheKey, clRow);
  } else {
    const locUpdate = { location_name: locationName, updated_at: new Date().toISOString() };
    if (lat) {
      locUpdate.current_latitude = lat;
      locUpdate.destination_latitude = lat;
    }
    if (lng) {
      locUpdate.current_longitude = lng;
      locUpdate.destination_longitude = lng;
    }
    await supabase.from('locations').update(locUpdate).eq('id', clRow.location_id);

    const countryName = addr.Country === 'SG' ? 'Singapore' : addr.Country || addr.CountryName || null;
    await supabase
      .from('customer_location')
      .update({
        building: addr.Building || addr.BuildingFloorRoom || null,
        street: addr.Street || null,
        block: addr.Block || null,
        city: addr.City || null,
        country_name: countryName,
        zip_code: addr.ZipCode || null,
        address_type: addr.AddressType || null,
        address: [addr.Street, addr.Building].filter(Boolean).join(', ') || null,
        location_id: clRow.location_id,
      })
      .eq('id', clRow.id);
  }

  await saveAddressDetails(supabase, cardCode, siteId, addr, clRow.id);

  return { locationId: clRow.location_id, customerLocationId: clRow.id };
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

  /** @type {Map<string, { customer_code: string, customer_name: string, phone_number: string|null, email: string|null, customer_address: string|null, source: string }>} */
  const customerAgg = new Map();

  for (const row of limited) {
    if (isSapMasterlistLeadRow(row)) continue;
    const code = str(row.SAP_CardCode);
    if (!code) continue;
    if (isCpPlaceholder(code)) continue;

    const name = str(row.SAP_CardName);
    const phone = str(row.SAP_Phone1) || str(row.AIFM_Phone) || null;
    const email = str(row.SAP_Email) || str(row.AIFM_Email) || null;
    const addr = rowToAddr(row, 'tmp');
    const formatted = formatAddressLikeServiceLocationTab(addr);

    if (!customerAgg.has(code)) {
      customerAgg.set(code, {
        customer_code: code,
        customer_name: name || code,
        phone_number: phone,
        email: email,
        customer_address: formatted,
        source: 'sap',
      });
    } else {
      const cur = customerAgg.get(code);
      if (name && (!cur.customer_name || cur.customer_name === cur.customer_code)) cur.customer_name = name;
      if (phone && !cur.phone_number) cur.phone_number = phone;
      if (email && !cur.email) cur.email = email;
      if (formatted && !cur.customer_address) cur.customer_address = formatted;
    }
  }

  const codes = [...customerAgg.keys()];
  console.log(`Rows in sheet (after limit): ${limited.length}`);
  console.log(`Distinct SAP CardCodes: ${codes.length}`);
  if (args.dryRun) {
    console.log('Dry run: no database writes.');
  }

  /** @type {Map<string, string>} */
  const codeToId = new Map();
  const existing = new Set();

  if (!args.dryRun && codes.length) {
    const chunk = 100;
    for (let i = 0; i < codes.length; i += chunk) {
      const batch = codes.slice(i, i + chunk);
      const { data, error } = await supabase
        .from('customer')
        .select('id, customer_code')
        .in('customer_code', batch)
        .is('deleted_at', null);
      if (error) throw error;
      for (const r of data || []) {
        existing.add(r.customer_code);
        codeToId.set(r.customer_code, r.id);
      }
    }

    const toInsert = codes.filter((c) => !existing.has(c)).map((c) => customerAgg.get(c));
    const insertChunk = 40;
    for (let i = 0; i < toInsert.length; i += insertChunk) {
      const batch = toInsert.slice(i, i + insertChunk);
      const { data, error } = await supabase.from('customer').insert(batch).select('id, customer_code');
      if (error) {
        for (const row of batch) {
          const { data: one, error: e1 } = await supabase
            .from('customer')
            .insert(row)
            .select('id, customer_code')
            .single();
          if (e1) {
            console.error(`Insert customer ${row.customer_code}:`, e1.message);
            continue;
          }
          codeToId.set(one.customer_code, one.id);
          existing.add(one.customer_code);
        }
      } else {
        for (const r of data || []) {
          codeToId.set(r.customer_code, r.id);
          existing.add(r.customer_code);
        }
      }
    }

    for (const c of codes) {
      if (!codeToId.has(c)) {
        const { data, error } = await supabase
          .from('customer')
          .select('id')
          .eq('customer_code', c)
          .is('deleted_at', null)
          .maybeSingle();
        if (!error && data?.id) codeToId.set(c, data.id);
      }
    }

    if (args.updateCustomer) {
      for (const c of codes) {
        const id = codeToId.get(c);
        const agg = customerAgg.get(c);
        if (!id || !agg) continue;
        await supabase
          .from('customer')
          .update({
            customer_name: agg.customer_name,
            phone_number: agg.phone_number,
            email: agg.email,
            customer_address: agg.customer_address,
            source: 'sap',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }
    }
  }

  const customerIds = args.dryRun ? [] : [...new Set([...codeToId.values()])];
  const clCache = args.dryRun ? new Map() : await loadCustomerLocationCache(supabase, customerIds);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let contactsWritten = 0;
  let contactWarnings = 0;
  let dryRunContactSignals = 0;
  const seenSite = new Set();

  for (const row of limited) {
    const cardCode = str(row.SAP_CardCode);
    if (!cardCode) {
      skipped++;
      continue;
    }
    if (isSapMasterlistLeadRow(row)) {
      skipped++;
      continue;
    }
    if (isCpPlaceholder(cardCode)) {
      skipped++;
      continue;
    }

    let siteId = deriveSiteId(row);
    if (!siteId) {
      skipped++;
      continue;
    }

    const adresType = normalizeAddressTypeCacheKey(sapAdresType(row));
    const dedupeKey = `${cardCode}|${siteId}|${adresType}`;
    if (seenSite.has(dedupeKey)) {
      skipped++;
      continue;
    }
    seenSite.add(dedupeKey);

    const customerId = args.dryRun ? null : codeToId.get(cardCode);
    if (!args.dryRun && !customerId) {
      console.warn(`No customer id for ${cardCode}, skipping row site ${siteId}`);
      skipped++;
      continue;
    }

    const addr = rowToAddr(row, siteId);
    const { lat, lng } = latLngFromRow(row);

    try {
      const { customerLocationId } = await ensureLocationAndCustomerLocation({
        supabase,
        customerId,
        cardCode,
        siteId,
        addr,
        lat,
        lng,
        dryRun: args.dryRun,
        clCache,
      });

      if (args.dryRun && args.contacts && hasContactSignal(row)) {
        dryRunContactSignals++;
      }

      const cres = await upsertSiteContact(supabase, customerId, customerLocationId, row, {
        dryRun: args.dryRun,
        contactsEnabled: args.contacts,
      });
      if (cres.warning) {
        contactWarnings++;
        console.warn(`[contacts] ${cres.warning}`);
      }
      if (cres.inserted || cres.updated) contactsWritten++;

      processed++;
    } catch (e) {
      errors++;
      console.error(`Error ${cardCode} / ${siteId}:`, e.message || e);
    }
  }

  console.log('\nDone.');
  console.log(`  Locations + address rows processed: ${processed}`);
  if (args.contacts) {
    if (args.dryRun) console.log(`  Rows with contact data (dry run, not written): ${dryRunContactSignals}`);
    else console.log(`  Contacts inserted/updated: ${contactsWritten}`);
    if (contactWarnings) console.log(`  Contact warnings: ${contactWarnings}`);
  } else {
    console.log(`  Contacts: skipped (--no-contacts)`);
  }
  console.log(`  Skipped rows: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
