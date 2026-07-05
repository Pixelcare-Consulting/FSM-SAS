/**
 * Import SAP leads (Excel tag SAP_Source = "SAP Lead") into public.sap_lead / sap_lead_location / sap_lead_contact.
 *
 * Same workbook + sheet as customer masterlist: "Mapped AIFM to SAP".
 *
 *   pnpm migrate:aifm-sap-leads
 *   pnpm migrate:aifm-sap-leads -- --dry-run
 *   pnpm migrate:aifm-sap-leads -- --limit=200
 *   pnpm migrate:aifm-sap-leads -- --no-contacts
 *
 * Requires: lib/supabase/migrations/create_sap_lead_masterlist.sql applied.
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
const { deriveSiteId } = require('./aifmMasterlistDeriveSiteId');

const DEFAULT_FILE = DEFAULT_AIFM_MASTERLIST_WORKBOOK;
const DEFAULT_SHEET = 'Mapped AIFM to SAP';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    limit: null,
    file: DEFAULT_FILE,
    sheet: DEFAULT_SHEET,
    updateLead: false,
    contacts: true,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--update-lead') out.updateLead = true;
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

/** Rows tagged as SAP Lead in Column SAP_Source, or L* CardCode when SAP_Source is blank. */
function isSapMasterlistLeadRow(row) {
  const raw = str(row.SAP_Source);
  if (raw && /^sap\s*leads?$/i.test(raw)) return true;
  const code = str(row.SAP_CardCode);
  if (!raw && /^L\d+/i.test(code)) return true;
  return false;
}

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
  return { first_name: first, middle_name, last_name: last };
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

function latLngFromRow(row) {
  const latRaw = row.AIFM_LOC_Latitude;
  const lngRaw = row.AIFM_LOC_Longitude;
  if (latRaw === '' || latRaw === null || lngRaw === '' || lngRaw === null) return { lat: null, lng: null };
  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw).trim());
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null };
  return { lat: String(lat), lng: String(lng) };
}

async function upsertLeadContact(supabase, sapLeadId, sapLeadLocationId, row, { dryRun, contactsEnabled }) {
  if (!contactsEnabled || !sapLeadId || dryRun) return { ok: true, skipped: true };
  if (!hasContactSignal(row)) return { ok: true, skipped: true };

  const names = contactNamesFromRow(row);
  const tel1 = str(row.SAP_Phone1) || str(row.AIFM_Phone) || null;
  const tel2 = str(row.SAP_Phone2) || str(row.SAP_Cellular) || null;
  const email = str(row.SAP_Email) || str(row.AIFM_Email) || null;

  const payload = {
    sap_lead_id: sapLeadId,
    sap_lead_location_id: sapLeadLocationId || null,
    first_name: names.first_name,
    middle_name: names.middle_name,
    last_name: names.last_name,
    tel1: tel1 || null,
    tel2: tel2 || null,
    email: email || null,
  };

  let q = supabase
    .from('sap_lead_contact')
    .select('id')
    .eq('sap_lead_id', sapLeadId)
    .eq('first_name', names.first_name)
    .eq('last_name', names.last_name);
  if (sapLeadLocationId) q = q.eq('sap_lead_location_id', sapLeadLocationId);
  else q = q.is('sap_lead_location_id', null);
  if (email) q = q.eq('email', email);
  else q = q.is('email', null);

  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr && findErr.code !== 'PGRST116') {
    throw new Error(`sap_lead_contact lookup: ${findErr.message}`);
  }

  if (existing?.id) {
    const { error: upErr } = await supabase.from('sap_lead_contact').update(payload).eq('id', existing.id);
    if (upErr) throw new Error(`sap_lead_contact update: ${upErr.message}`);
    return { ok: true, updated: true };
  }

  const { error: insErr } = await supabase.from('sap_lead_contact').insert(payload);
  if (insErr) throw new Error(`sap_lead_contact insert: ${insErr.message}`);
  return { ok: true, inserted: true };
}

async function loadSapLeadLocationCache(supabase, leadIds) {
  const map = new Map();
  const chunk = 80;
  for (let i = 0; i < leadIds.length; i += chunk) {
    const slice = leadIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from('sap_lead_location')
      .select('id, sap_lead_id, site_id, location_id')
      .in('sap_lead_id', slice);
    if (error) throw error;
    for (const r of data || []) {
      if (r.site_id) map.set(`${r.sap_lead_id}|${str(r.site_id)}`, r);
    }
  }
  return map;
}

async function ensureSapLeadLocation({
  supabase,
  sapLeadId,
  siteId,
  addr,
  lat,
  lng,
  dryRun,
  clCache,
}) {
  const cacheKey = `${sapLeadId}|${siteId}`;
  let clRow = clCache.get(cacheKey);
  const locationName = formatAddressLikeServiceLocationTab(addr) || '—';

  if (dryRun) {
    return { sapLeadLocationId: clRow?.id ?? null };
  }

  if (!clRow) {
    const locInsert = { customer_id: null, location_name: locationName };
    if (lat) {
      locInsert.current_latitude = lat;
      locInsert.destination_latitude = lat;
    }
    if (lng) {
      locInsert.current_longitude = lng;
      locInsert.destination_longitude = lng;
    }

    const { data: loc, error: locErr } = await supabase.from('locations').insert(locInsert).select('id').single();
    if (locErr) throw new Error(`locations insert (lead): ${locErr.message}`);

    const countryName = addr.Country === 'SG' ? 'Singapore' : addr.Country || addr.CountryName || null;
    const clPayload = {
      sap_lead_id: sapLeadId,
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
      .from('sap_lead_location')
      .insert(clPayload)
      .select('id, location_id')
      .single();

    if (insErr) {
      const fallback = { ...clPayload };
      delete fallback.location_id;
      const { data: ins2, error: e2 } = await supabase
        .from('sap_lead_location')
        .insert(fallback)
        .select('id, location_id')
        .single();
      if (e2) throw new Error(`sap_lead_location insert: ${insErr.message}; ${e2.message}`);
      clRow = { id: ins2.id, sap_lead_id: sapLeadId, site_id: siteId, location_id: ins2.location_id ?? loc.id };
      if (!ins2.location_id) {
        await supabase.from('sap_lead_location').update({ location_id: loc.id }).eq('id', ins2.id);
        clRow.location_id = loc.id;
      }
    } else {
      clRow = { id: ins.id, sap_lead_id: sapLeadId, site_id: siteId, location_id: ins.location_id };
    }
    clCache.set(cacheKey, clRow);
  } else if (!clRow.location_id) {
    const locInsert = { customer_id: null, location_name: locationName };
    if (lat) {
      locInsert.current_latitude = lat;
      locInsert.destination_latitude = lat;
    }
    if (lng) {
      locInsert.current_longitude = lng;
      locInsert.destination_longitude = lng;
    }
    const { data: loc, error: locErr } = await supabase.from('locations').insert(locInsert).select('id').single();
    if (locErr) throw new Error(`locations insert (link sap_lead_location): ${locErr.message}`);

    const countryName = addr.Country === 'SG' ? 'Singapore' : addr.Country || addr.CountryName || null;
    await supabase
      .from('sap_lead_location')
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
      .from('sap_lead_location')
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

  return { sapLeadLocationId: clRow.id };
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
  const leadRows = rows.filter(isSapMasterlistLeadRow);
  const limited = args.limit ? leadRows.slice(0, args.limit) : leadRows;

  /** @type {Map<string, { lead_code, lead_name, phone_number, email, lead_address }>} */
  const leadAgg = new Map();

  for (const row of limited) {
    const code = str(row.SAP_CardCode);
    if (!code) continue;

    const name = str(row.SAP_CardName);
    const phone = str(row.SAP_Phone1) || str(row.AIFM_Phone) || null;
    const email = str(row.SAP_Email) || str(row.AIFM_Email) || null;
    const addr = rowToAddr(row, 'tmp');
    const formatted = formatAddressLikeServiceLocationTab(addr);

    if (!leadAgg.has(code)) {
      leadAgg.set(code, {
        lead_code: code,
        lead_name: name || code,
        phone_number: phone,
        email: email,
        lead_address: formatted,
      });
    } else {
      const cur = leadAgg.get(code);
      if (name && (!cur.lead_name || cur.lead_name === cur.lead_code)) cur.lead_name = name;
      if (phone && !cur.phone_number) cur.phone_number = phone;
      if (email && !cur.email) cur.email = email;
      if (formatted && !cur.lead_address) cur.lead_address = formatted;
    }
  }

  const codes = [...leadAgg.keys()];
  console.log(`Lead-tagged rows in sheet: ${leadRows.length}`);
  console.log(`Lead rows after --limit: ${limited.length}`);
  console.log(`Distinct lead codes: ${codes.length}`);

  /** @type {Map<string, string>} */
  const codeToId = new Map();
  const existing = new Set();

  if (!args.dryRun && codes.length) {
    const chunk = 100;
    for (let i = 0; i < codes.length; i += chunk) {
      const batch = codes.slice(i, i + chunk);
      const { data, error } = await supabase
        .from('sap_lead')
        .select('id, lead_code')
        .in('lead_code', batch)
        .is('deleted_at', null);
      if (error) throw error;
      for (const r of data || []) {
        existing.add(r.lead_code);
        codeToId.set(r.lead_code, r.id);
      }
    }

    const toInsert = codes.filter((c) => !existing.has(c)).map((c) => leadAgg.get(c));
    const insertChunk = 40;
    for (let i = 0; i < toInsert.length; i += insertChunk) {
      const batch = toInsert.slice(i, i + insertChunk);
      const { data, error } = await supabase.from('sap_lead').insert(batch).select('id, lead_code');
      if (error) {
        for (const row of batch) {
          const { data: one, error: e1 } = await supabase
            .from('sap_lead')
            .insert(row)
            .select('id, lead_code')
            .single();
          if (e1) {
            console.error(`Insert sap_lead ${row.lead_code}:`, e1.message);
            continue;
          }
          codeToId.set(one.lead_code, one.id);
          existing.add(one.lead_code);
        }
      } else {
        for (const r of data || []) {
          codeToId.set(r.lead_code, r.id);
          existing.add(r.lead_code);
        }
      }
    }

    for (const c of codes) {
      if (!codeToId.has(c)) {
        const { data, error } = await supabase
          .from('sap_lead')
          .select('id')
          .eq('lead_code', c)
          .is('deleted_at', null)
          .maybeSingle();
        if (!error && data?.id) codeToId.set(c, data.id);
      }
    }

    if (args.updateLead) {
      for (const c of codes) {
        const id = codeToId.get(c);
        const agg = leadAgg.get(c);
        if (!id || !agg) continue;
        await supabase
          .from('sap_lead')
          .update({
            lead_name: agg.lead_name,
            phone_number: agg.phone_number,
            email: agg.email,
            lead_address: agg.lead_address,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }
    }
  }

  const leadIds = args.dryRun ? [] : [...new Set([...codeToId.values()])];
  const clCache = args.dryRun ? new Map() : await loadSapLeadLocationCache(supabase, leadIds);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let contactsWritten = 0;
  const seenSite = new Set();

  for (const row of limited) {
    const cardCode = str(row.SAP_CardCode);
    if (!cardCode) {
      skipped++;
      continue;
    }

    const sapLeadId = args.dryRun ? null : codeToId.get(cardCode);
    if (!args.dryRun && !sapLeadId) {
      skipped++;
      continue;
    }

    let siteId = deriveSiteId(row);

    if (siteId) {
      const dedupeKey = `${cardCode}|${siteId}`;
      if (seenSite.has(dedupeKey)) {
        skipped++;
        continue;
      }
      seenSite.add(dedupeKey);

      const addr = rowToAddr(row, siteId);
      const { lat, lng } = latLngFromRow(row);

      try {
        const { sapLeadLocationId } = await ensureSapLeadLocation({
          supabase,
          sapLeadId,
          siteId,
          addr,
          lat,
          lng,
          dryRun: args.dryRun,
          clCache,
        });

        const cres = await upsertLeadContact(supabase, sapLeadId, sapLeadLocationId, row, {
          dryRun: args.dryRun,
          contactsEnabled: args.contacts,
        });
        if (cres.inserted || cres.updated) contactsWritten++;

        processed++;
      } catch (e) {
        errors++;
        console.error(`Error ${cardCode} / ${siteId}:`, e.message || e);
      }
    } else {
      try {
        const cres = await upsertLeadContact(supabase, sapLeadId, null, row, {
          dryRun: args.dryRun,
          contactsEnabled: args.contacts,
        });
        if (cres.inserted || cres.updated) contactsWritten++;
        processed++;
      } catch (e) {
        errors++;
        console.error(`Error ${cardCode} (no site):`, e.message || e);
      }
      skipped++;
    }
  }

  console.log('\nDone (SAP leads masterlist).');
  console.log(`  Location/contact row passes: ${processed}`);
  if (args.contacts && !args.dryRun) console.log(`  Contacts inserted/updated: ${contactsWritten}`);
  console.log(`  Skipped passes: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  if (args.dryRun) console.log('  Dry run — no database writes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
