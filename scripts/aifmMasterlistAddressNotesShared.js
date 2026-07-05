/**
 * Shared: derive site keys + read AH / Address Notes from "Mapped AIFM to SAP" rows and upsert
 * `customer_address_details.address_notes`. Used by the full contacts+notes importer and
 * `patch-aifm-address-notes-only.js`.
 */

'use strict';

const { str } = require('./aifmMasterlistRowFields');
const {
  siteKeyVariants,
  zipFromMasterlistRow,
  lookupCustomerLocationRow,
} = require('./aifmCustomerLocationLookup');
const { deriveSiteId } = require('./aifmMasterlistDeriveSiteId');

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

function normalizeExcelHeader(key) {
  return String(key || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function trimCell(val) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/\u00a0/g, ' ').trim();
}

/** AH column labels vary (incl. SAP_ / NBSP); pick the strongest matching header. */
function addressNotesFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  const preferred = row['Address Notes'];
  if (preferred !== undefined && preferred !== null) {
    const t = trimCell(preferred);
    return t === '' ? '' : t;
  }

  /** @type {Array<{ prio: number; key: string; val: string }>} */
  const hits = [];

  for (const key of Object.keys(row)) {
    if (!key || typeof key !== 'string') continue;
    const norm = normalizeExcelHeader(key);
    let prio = 0;
    if (norm === 'address notes') prio = 100;
    else if (norm === 'sap_address notes' || norm === 'sap address notes') prio = 95;
    else if (norm.endsWith('_address_notes') || norm === 'address_notes') prio = 90;
    else if (norm.includes('address') && norm.includes('note')) prio = 50;

    if (!prio) continue;
    const v = trimCell(row[key]);
    if (v === '') continue;
    hits.push({ prio, key, val: v });
  }

  hits.sort((a, b) => b.prio - a.prio || a.key.localeCompare(b.key));
  return hits[0]?.val ?? '';
}

async function upsertAddressNotes(supabase, cardCode, excelSiteId, customerLocationId, notesText, dryRun) {
  const address_notes = str(notesText) === '' ? null : str(notesText);
  if (dryRun) return { ok: true, dry: true };

  let existingRow = null;
  for (const variant of siteKeyVariants(excelSiteId)) {
    const { data, error } = await supabase
      .from('customer_address_details')
      .select('id, address_name')
      .eq('customer_code', cardCode)
      .eq('address_name', variant)
      .is('deleted_at', null)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`customer_address_details lookup: ${error.message}`);
    }
    if (data?.id) {
      existingRow = data;
      break;
    }
  }

  if (!existingRow?.id && customerLocationId) {
    const { data, error } = await supabase
      .from('customer_address_details')
      .select('id, address_name')
      .eq('customer_code', cardCode)
      .eq('customer_location_id', customerLocationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`customer_address_details lookup by customer_location_id: ${error.message}`);
    }
    if (data?.id) existingRow = data;
  }

  const updatedAt = new Date().toISOString();

  if (existingRow?.id) {
    const patch = {
      address_notes,
      updated_at: updatedAt,
    };
    if (customerLocationId) patch.customer_location_id = customerLocationId;

    const { error } = await supabase.from('customer_address_details').update(patch).eq('id', existingRow.id);
    if (error) throw new Error(`customer_address_details update: ${error.message}`);
    return { ok: true, updated: true };
  }

  let addressNameForInsert = excelSiteId;
  if (customerLocationId) {
    const { data: cl, error: clErr } = await supabase
      .from('customer_location')
      .select('site_id')
      .eq('id', customerLocationId)
      .maybeSingle();
    if (clErr && clErr.code !== 'PGRST116') {
      throw new Error(`customer_location.site_id lookup: ${clErr.message}`);
    }
    const sid = str(cl?.site_id);
    if (sid) addressNameForInsert = sid;
  }

  const insertPayload = {
    customer_code: cardCode,
    address_name: addressNameForInsert,
    address_notes,
    updated_at: updatedAt,
    status: 'Active',
  };
  if (customerLocationId) insertPayload.customer_location_id = customerLocationId;

  const { error } = await supabase.from('customer_address_details').insert(insertPayload);
  if (error) throw new Error(`customer_address_details insert: ${error.message}`);
  return { ok: true, inserted: true };
}

async function loadCodeToId(supabase, codes) {
  const map = new Map();
  const chunk = 100;
  for (let i = 0; i < codes.length; i += chunk) {
    const batch = codes.slice(i, i + chunk);
    const { data, error } = await supabase
      .from('customer')
      .select('id, customer_code')
      .in('customer_code', batch)
      .is('deleted_at', null);
    if (error) throw error;
    for (const r of data || []) map.set(r.customer_code, r.id);
  }
  return map;
}

/**
 * Rows are repeated for the same (SAP_CardCode + deriveSiteId). Address Notes (AH) is often only populated
 * on a later duplicate, so naive "keep first row" skips all notes.
 */
function overlayContactSlots(targetRow, sourceRow) {
  for (let i = 1; i <= 3; i += 1) {
    const nameK = `Contact_${i}_Name`;
    const emailK = `Contact_${i}_Email`;
    const phoneK = `Contact_${i}_Phone`;
    if (!str(targetRow[nameK]) && str(sourceRow[nameK])) targetRow[nameK] = sourceRow[nameK];
    if (!str(targetRow[emailK]) && str(sourceRow[emailK])) targetRow[emailK] = sourceRow[emailK];
    if (!str(targetRow[phoneK]) && str(sourceRow[phoneK])) targetRow[phoneK] = sourceRow[phoneK];
  }
}

/** Fill SAP address columns from later duplicate workbook lines (street often only on a sibling row). */
function overlayAddressFields(targetRow, sourceRow) {
  if (!str(targetRow.SAP_Street) && str(sourceRow.SAP_Street)) {
    targetRow.SAP_Street = sourceRow.SAP_Street;
  }
  if (!str(targetRow.SAP_Building) && str(sourceRow.SAP_Building)) {
    targetRow.SAP_Building = sourceRow.SAP_Building;
  }
  if (!str(targetRow.SAP_ZipCode) && str(sourceRow.SAP_ZipCode)) {
    targetRow.SAP_ZipCode = sourceRow.SAP_ZipCode;
  }
  if (!str(targetRow.SAP_Zip) && str(sourceRow.SAP_Zip)) {
    targetRow.SAP_Zip = sourceRow.SAP_Zip;
  }
  if (!str(targetRow.SAP_City) && str(sourceRow.SAP_City)) {
    targetRow.SAP_City = sourceRow.SAP_City;
  }
}

/**
 * One row per `(CardCode | deriveSiteId)`. `notes` is the **last non-empty** Address Notes across duplicates.
 * `row` is shallow copy of the first line plus Contact_* filled from later duplicate lines where blank.
 *
 * @param {Record<string, unknown>[]} rows
 * @returns {Array<{ cardCode: string, siteId: string, row: Record<string, unknown>, notes: string }>}
 */
function buildMergedAddressNotesWorkQueue(rows) {
  const order = [];
  const byKey = new Map();

  for (const sheetRow of rows) {
    const cardCode = str(sheetRow.SAP_CardCode);
    if (!cardCode || isSapMasterlistLeadRow(sheetRow) || isCpPlaceholder(cardCode)) continue;

    const siteId = deriveSiteId(sheetRow);
    if (!siteId) continue;

    const key = `${cardCode}|${siteId}`;
    const cell = str(addressNotesFromRow(sheetRow));

    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, { cardCode, siteId, row: { ...sheetRow }, notes: cell });
      continue;
    }

    const cur = byKey.get(key);
    if (cell) cur.notes = cell;
    overlayContactSlots(cur.row, sheetRow);
    overlayAddressFields(cur.row, sheetRow);
  }

  return order.map((k) => byKey.get(k));
}

module.exports = {
  str,
  isCpPlaceholder,
  isSapMasterlistLeadRow,
  normalizeExcelHeader,
  trimCell,
  addressNotesFromRow,
  deriveSiteId,
  upsertAddressNotes,
  zipFromMasterlistRow,
  lookupCustomerLocationRow,
  loadCodeToId,
  buildMergedAddressNotesWorkQueue,
};
