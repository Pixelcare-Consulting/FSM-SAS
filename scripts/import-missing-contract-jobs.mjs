#!/usr/bin/env node
/**
 * Import contract jobs from missing-contract / contract-jobs workbooks (auto-detects layout).
 *
 *   pnpm import:missing-contract-jobs --dry-run
 *   pnpm import:contract-jobs:dry
 *   pnpm import:contract-jobs --month=9 --year=2026
 *   pnpm import:missing-contract-jobs --bp=C000219
 *   pnpm import:missing-contract-jobs --urgent-only
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNextJobNumber } from '../lib/jobs/getNextJobNumber.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const XLSX = require('xlsx');

const DEFAULT_FILE = path.join(
  __dirname,
  '..',
  'public',
  'sample-migration',
  '2026.06.13 Missing Contract Jobs.xlsx'
);
const FALLBACK_SHEET_NAME = 'Missing Contract Job';
const MAX_HEADER_SCAN_ROW = 2;
const MAX_DATA_ROWS = 10000;
const JOB_NUM_IN_CELL_RE = /\(20\d{2}-\d{6}\)/;
const DASH_JOB_REF_RE = /\d{2}\.\d{2}\.\d{4}\s*-\s*\d+/;
const DATE_IN_CELL_RE = /(\d{2})\.(\d{2})\.(\d{4})/;
const SLOT_HEADER_RE = /^(\d+)(st|nd|rd|th)$/i;

const HEADER_ALIASES = {
  quotation: ['Quotation', 'QUOTATION'],
  salesOrder: ['S/O', 'SO', 'Sales Order'],
  invoice: ['Invoice', 'INVOICE'],
  bpCode: ['BP Code', 'BP CODE', 'BPCode'],
  customerName: ['Customer Name', 'Customer', 'CUSTOMER NAME'],
  address: ['Address', 'ADDRESS'],
  unitNumber: ['Unit Number', 'Unit No', 'Unit', 'UNIT NUMBER'],
  postalCode: ['Postal Code', 'Postal', 'POSTAL CODE', 'Zip Code'],
  jobDescription: ['Job Description', 'JOB DESCRIPTION', 'Description'],
  expectedJobs: ['No. of Jobs', 'No.of Jobs', 'No of Jobs', 'Number of Jobs'],
};

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    urgentOnly: false,
    month: null,
    year: null,
    bp: null,
    file: DEFAULT_FILE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--dryrun' || a === '-n') out.dryRun = true;
    if (a === '--urgent-only') out.urgentOnly = true;
    if (a.startsWith('--month=')) out.month = parseInt(a.slice(8), 10) || null;
    if (a.startsWith('--year=')) out.year = parseInt(a.slice(7), 10) || null;
    if (a.startsWith('--bp=')) out.bp = str(a.slice(5)).toUpperCase();
    if (a.startsWith('--file=')) {
      let filePath = a.slice(7).trim();
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        i++;
        filePath += ` ${argv[i]}`;
      }
      out.file = filePath;
    }
  }
  return out;
}

function getCell(ws, row, col) {
  return ws[XLSX.utils.encode_cell({ r: row, c: col })];
}

function cellText(ws, row, col) {
  const cell = getCell(ws, row, col);
  if (!cell) return '';
  return str(cell.v);
}

function normalizeHeader(h) {
  return str(h).toLowerCase().replace(/\s+/g, ' ').trim();
}

function findHeaderCol(ws, headerRow, aliases) {
  for (let c = 0; c < 60; c++) {
    const text = normalizeHeader(cellText(ws, headerRow, c));
    if (!text) continue;
    for (const alias of aliases) {
      if (text === normalizeHeader(alias)) return c;
    }
  }
  return -1;
}

function findFirstSlotCol(ws, headerRow) {
  for (let c = 0; c < 60; c++) {
    const h = str(cellText(ws, headerRow, c));
    if (/^1st$/i.test(h)) return c;
  }
  return -1;
}

function findSlotColumns(ws, headerRow, firstSlotCol) {
  const slots = [];
  for (let c = firstSlotCol; c < 60; c++) {
    const header = str(cellText(ws, headerRow, c));
    if (!header || !SLOT_HEADER_RE.test(header)) break;
    slots.push({ col: c, slot: header });
  }
  return slots;
}

function detectHeaderRow(ws) {
  for (let r = 0; r <= MAX_HEADER_SCAN_ROW; r++) {
    const bpCol = findHeaderCol(ws, r, HEADER_ALIASES.bpCode);
    const firstSlotCol = findFirstSlotCol(ws, r);
    if (bpCol >= 0 && firstSlotCol >= 0) return r;
  }
  throw new Error('Could not find header row with "BP Code" and "1st" columns');
}

function detectColumnLayout(ws) {
  const headerRow = detectHeaderRow(ws);
  const cols = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    cols[key] = findHeaderCol(ws, headerRow, aliases);
  }
  const firstSlotCol = findFirstSlotCol(ws, headerRow);
  if (cols.bpCode < 0) throw new Error('Header row missing "BP Code" column');
  if (cols.invoice < 0) throw new Error('Header row missing "Invoice" column');
  if (firstSlotCol < 0) throw new Error('Header row missing "1st" slot column');
  return { cols, firstSlotCol, headerRow };
}

function sheetHasContractHeaders(ws) {
  for (let r = 0; r <= MAX_HEADER_SCAN_ROW; r++) {
    const bpCol = findHeaderCol(ws, r, HEADER_ALIASES.bpCode);
    const firstSlotCol = findFirstSlotCol(ws, r);
    if (bpCol >= 0 && firstSlotCol >= 0) return true;
  }
  return false;
}

function pickWorksheet(wb) {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws && sheetHasContractHeaders(ws)) return { name, ws };
  }
  if (wb.Sheets[FALLBACK_SHEET_NAME]) {
    return { name: FALLBACK_SHEET_NAME, ws: wb.Sheets[FALLBACK_SHEET_NAME] };
  }
  const name = wb.SheetNames[0];
  if (!name) throw new Error('Workbook has no sheets');
  return { name, ws: wb.Sheets[name] };
}

function isGreySolidCell(cell) {
  return cell?.s?.patternType === 'solid';
}

function classifySlotCell(cell, raw) {
  const text = str(raw);
  if (!text) return null;

  const hasExistingJob = JOB_NUM_IN_CELL_RE.test(text);
  const hasDashJobRef = DASH_JOB_REF_RE.test(text);
  const isGrey = isGreySolidCell(cell);
  const dateYmd = parseSlotDate(text);

  if (hasExistingJob) {
    return { action: 'SKIP', skipReason: 'fsm_job_number_in_cell', dateYmd };
  }
  if (isGrey) {
    return { action: 'SKIP', skipReason: 'grey_highlight', dateYmd };
  }
  if (hasDashJobRef) {
    return { action: 'SKIP', skipReason: 'dash_job_ref', dateYmd };
  }
  if (dateYmd) {
    return { action: 'IMPORT', skipReason: null, dateYmd };
  }
  return { action: 'SKIP', skipReason: 'no_parseable_date', dateYmd: null };
}

function parseSlotDate(cellRaw) {
  const text = str(cellRaw);
  if (!text) return null;
  const m = text.match(DATE_IN_CELL_RE);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function contractImportMarker(invoice, slot) {
  return `[CONTRACT-IMPORT:${invoice}:${slot}]`;
}

function isUrgentSlot(bpCode, dateYmd) {
  return bpCode === 'C000219' && dateYmd === '2026-07-05';
}

function formatAddressLikeServiceLocationTab(addr) {
  const country = addr?.Country === 'SG' ? 'Singapore' : addr?.Country || addr?.CountryName || '';
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

function normalizeForMatch(s) {
  return str(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function scoreSapAddressMatch(addr, hints) {
  let score = 0;
  const zip = normalizeForMatch(addr?.ZipCode);
  const hintZip = normalizeForMatch(hints.postalCode);
  if (hintZip && zip && zip === hintZip) score += 10;

  const street = normalizeForMatch(addr?.Street);
  const hintStreet = normalizeForMatch(hints.address);
  if (hintStreet && street && (street.includes(hintStreet) || hintStreet.includes(street))) score += 5;

  const building = normalizeForMatch(addr?.Building || addr?.BuildingFloorRoom);
  const hintUnit = normalizeForMatch(hints.unitNumber);
  if (hintUnit && building && (building.includes(hintUnit) || hintUnit.includes(building))) score += 3;

  const type = str(addr?.AddressType).toLowerCase();
  if (type.includes('shipto') || type === 's') score += 1;
  return score;
}

function pickSapAddress(bpAddresses, hints) {
  if (!Array.isArray(bpAddresses) || bpAddresses.length === 0) return null;
  let best = bpAddresses[0];
  let bestScore = -1;
  for (const addr of bpAddresses) {
    const score = scoreSapAddressMatch(addr, hints);
    if (score > bestScore) {
      bestScore = score;
      best = addr;
    }
  }
  return best;
}

function parseWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellStyles: true });
  const { name: sheetName, ws } = pickWorksheet(wb);
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  const { cols, firstSlotCol, headerRow } = detectColumnLayout(ws);
  const slotHeaders = findSlotColumns(ws, headerRow, firstSlotCol);
  if (!slotHeaders.length) throw new Error(`No slot columns found from "1st" at col ${firstSlotCol}`);

  const dataRowStart = headerRow + 1;
  console.log(
    `Sheet: ${sheetName} | header row ${headerRow + 1} | data from row ${dataRowStart + 1} | slots ${slotHeaders[0].slot}–${slotHeaders[slotHeaders.length - 1].slot}`
  );

  const contracts = [];
  for (let r = dataRowStart; r < dataRowStart + MAX_DATA_ROWS; r++) {
    const quotation = cols.quotation >= 0 ? cellText(ws, r, cols.quotation) : '';
    const salesOrder = cols.salesOrder >= 0 ? cellText(ws, r, cols.salesOrder) : '';
    const invoice = cellText(ws, r, cols.invoice);
    const bpCode = str(cellText(ws, r, cols.bpCode)).toUpperCase();
    const customerName = cols.customerName >= 0 ? cellText(ws, r, cols.customerName) : '';
    const address = cols.address >= 0 ? cellText(ws, r, cols.address) : '';
    const unitNumber = cols.unitNumber >= 0 ? cellText(ws, r, cols.unitNumber) : '';
    const postalCode = cols.postalCode >= 0 ? cellText(ws, r, cols.postalCode) : '';
    const jobDescription = cols.jobDescription >= 0 ? cellText(ws, r, cols.jobDescription) : '';
    const expectedJobs = cols.expectedJobs >= 0 ? cellText(ws, r, cols.expectedJobs) : '';

    if (!bpCode && !invoice) break;

    const slots = [];
    for (const { col, slot } of slotHeaders) {
      const cell = getCell(ws, r, col);
      const raw = cell ? str(cell.v) : '';
      if (!raw) continue;

      const classified = classifySlotCell(cell, raw);
      const { action, skipReason, dateYmd } = classified;

      slots.push({
        slot,
        raw,
        action,
        skipReason,
        dateYmd,
        marker: contractImportMarker(invoice, slot),
        priority: isUrgentSlot(bpCode, dateYmd) ? 'URGENT' : 'MEDIUM',
      });
    }

    contracts.push({
      rowIndex: r + 1,
      quotation,
      salesOrder,
      invoice,
      bpCode,
      customerName,
      address,
      unitNumber,
      postalCode,
      jobDescription,
      expectedJobs,
      slots,
    });
  }

  return contracts;
}

function flattenImportSlots(contracts) {
  const rows = [];
  for (const contract of contracts) {
    for (const slot of contract.slots) {
      rows.push({ contract, slot });
    }
  }
  return rows;
}

function applyFilters(rows, args) {
  return rows.filter(({ contract, slot }) => {
    if (slot.action === 'SKIP') return true;
    if (args.bp && contract.bpCode !== args.bp) return false;
    if (args.urgentOnly && !isUrgentSlot(contract.bpCode, slot.dateYmd)) return false;
    if (args.month != null && slot.dateYmd) {
      const d = new Date(`${slot.dateYmd}T12:00:00`);
      if (d.getMonth() + 1 !== args.month) return false;
    }
    if (args.year != null && slot.dateYmd) {
      const y = parseInt(slot.dateYmd.slice(0, 4), 10);
      if (y !== args.year) return false;
    }
    return true;
  });
}

async function findCustomerByCode(supabase, bpCode) {
  const { data, error } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name, customer_address')
    .eq('customer_code', bpCode)
    .is('deleted_at', null)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function markerExists(supabase, marker) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_number')
    .ilike('description', `%${marker}%`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function createJob(supabase, jobData) {
  const { data, error } = await supabase.from('jobs').insert(jobData).select().single();
  if (error) throw error;
  return data;
}

async function fetchBpDetailsLocal(sapService, cardCode, sessionCookies) {
  const requestedCode = str(cardCode).toUpperCase();
  const bp = await sapService.getBusinessPartner(requestedCode, sessionCookies);
  const confirmedCode = str(bp?.CardCode).toUpperCase();
  if (!confirmedCode) return null;

  let bpAddresses = Array.isArray(bp?.BPAddresses) ? bp.BPAddresses : [];
  if (!bpAddresses.length) {
    bpAddresses = (await sapService.getBusinessPartnerAddresses(confirmedCode, sessionCookies)) || [];
  }

  return {
    cardCode: confirmedCode,
    cardName: bp?.CardName || null,
    phone: bp?.Phone1 || bp?.Cellular || bp?.Phone2 || null,
    email: bp?.EmailAddress || null,
    bpAddresses: bpAddresses.filter((a) => a?.AddressName || a?.Street),
  };
}

async function upsertCustomerLocationsMinimal(supabase, customerId, bpAddresses) {
  for (const addr of bpAddresses) {
    const siteId = str(addr?.AddressName) || str(addr?.Street);
    if (!siteId) continue;

    const { data: existing } = await supabase
      .from('customer_location')
      .select('id')
      .eq('customer_id', customerId)
      .eq('site_id', siteId.slice(0, 100))
      .maybeSingle();
    if (existing?.id) continue;

    const countryName = addr?.Country === 'SG' ? 'Singapore' : addr?.CountryName || addr?.Country || null;
    await supabase.from('customer_location').insert({
      customer_id: customerId,
      site_id: siteId.slice(0, 100),
      building: addr?.Building || addr?.BuildingFloorRoom || null,
      street: addr?.Street || null,
      block: addr?.Block || null,
      city: addr?.City || null,
      country_name: countryName,
      zip_code: addr?.ZipCode || null,
      address_type: addr?.AddressType || null,
      address: formatAddressLikeServiceLocationTab(addr),
    });
  }
}

async function syncCustomerFromSap(supabase, sapService, sessionCookies, contract) {
  const bpCode = contract.bpCode;
  const details = await fetchBpDetailsLocal(sapService, bpCode, sessionCookies);
  if (!details?.cardCode) {
    throw new Error(`SAP Business Partner ${bpCode} not found — aborting contract ${contract.invoice}`);
  }

  const customer_name = details.cardName || contract.customerName || details.cardCode;

  const { data: existing, error: selErr } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name, customer_address')
    .eq('customer_code', details.cardCode)
    .is('deleted_at', null)
    .maybeSingle();
  if (selErr) throw new Error(`customer select ${details.cardCode}: ${selErr.message}`);

  let customerId = existing?.id;
  const sapSynced = !existing?.id;

  if (existing?.id) {
    const patch = {
      customer_name,
      updated_at: new Date().toISOString(),
      synced_to_sap_at: new Date().toISOString(),
    };
    if (details.phone) patch.phone_number = details.phone;
    if (details.email) patch.email = details.email;
    const { error: updErr } = await supabase.from('customer').update(patch).eq('id', existing.id);
    if (updErr) throw new Error(`customer update ${details.cardCode}: ${updErr.message}`);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('customer')
      .insert({
        customer_code: details.cardCode,
        customer_name,
        phone_number: details.phone,
        email: details.email,
        source: 'sap',
        synced_to_sap_at: new Date().toISOString(),
      })
      .select('id, customer_code, customer_name')
      .single();
    if (insErr) throw new Error(`customer insert ${details.cardCode}: ${insErr.message}`);
    customerId = inserted.id;
  }

  if (details.bpAddresses?.length) {
    await upsertCustomerLocationsMinimal(supabase, customerId, details.bpAddresses);
  }

  return {
    customer: { id: customerId, customer_code: details.cardCode, customer_name },
    bpAddresses: details.bpAddresses || [],
    sapSynced,
  };
}

async function resolveCustomer(supabase, sapService, sessionCookies, contract, cache, dryRun) {
  const bpCode = contract.bpCode;
  if (cache.has(bpCode)) return cache.get(bpCode);

  let customer = await findCustomerByCode(supabase, bpCode);
  let bpAddresses = [];
  let sapSynced = false;

  if (!customer) {
    if (!sessionCookies) {
      throw new Error(`Customer ${bpCode} missing and SAP session unavailable`);
    }
    const details = await fetchBpDetailsLocal(sapService, bpCode, sessionCookies);
    if (!details?.cardCode) {
      throw new Error(`SAP Business Partner ${bpCode} not found — aborting contract ${contract.invoice}`);
    }
    bpAddresses = details.bpAddresses || [];
    sapSynced = true;
    if (dryRun) {
      customer = {
        id: null,
        customer_code: details.cardCode,
        customer_name: details.cardName || contract.customerName,
        dryRunPlaceholder: true,
      };
    } else {
      const synced = await syncCustomerFromSap(supabase, sapService, sessionCookies, contract);
      customer = synced.customer;
      bpAddresses = synced.bpAddresses;
    }
  } else if (sessionCookies) {
    const details = await fetchBpDetailsLocal(sapService, bpCode, sessionCookies);
    if (!details?.cardCode) {
      throw new Error(`SAP Business Partner ${bpCode} not found — aborting contract ${contract.invoice}`);
    }
    bpAddresses = details.bpAddresses || [];
  }

  const result = { customer, bpAddresses, sapSynced };
  cache.set(bpCode, result);
  return result;
}

async function resolveLocation(supabase, customerId, bpAddresses, hints, dryRun) {
  const picked = pickSapAddress(bpAddresses, hints);
  const displayName = picked ? formatAddressLikeServiceLocationTab(picked) : hints.address || '—';
  const siteId = str(picked?.AddressName);

  const { data: custLocs } = await supabase
    .from('customer_location')
    .select('id, site_id, location_id, zip_code, street, address')
    .eq('customer_id', customerId);

  let clRow = null;
  if (siteId) {
    clRow = (custLocs || []).find((r) => str(r.site_id) === siteId) || null;
  }
  if (!clRow && hints.postalCode) {
    const hintZip = normalizeForMatch(hints.postalCode);
    clRow =
      (custLocs || []).find((r) => normalizeForMatch(r.zip_code) === hintZip) ||
      (custLocs || []).find((r) => scoreSapAddressMatch({ Street: r.street, ZipCode: r.zip_code }, hints) >= 10) ||
      null;
  }
  if (!clRow && custLocs?.length) {
    clRow = custLocs[0];
  }

  if (clRow?.location_id) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id, location_name')
      .eq('id', clRow.location_id)
      .maybeSingle();
    if (loc?.id) {
      return { id: loc.id, address: displayName || loc.location_name };
    }
  }

  const { data: existingLoc } = await supabase
    .from('locations')
    .select('id, location_name')
    .eq('customer_id', customerId)
    .eq('location_name', displayName)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingLoc?.id) {
    if (clRow?.id && !clRow.location_id && !dryRun) {
      await supabase.from('customer_location').update({ location_id: existingLoc.id }).eq('id', clRow.id);
    }
    return { id: existingLoc.id, address: displayName };
  }

  if (dryRun) {
    return { id: null, address: displayName, dryRunPlaceholder: true };
  }

  const { data: created, error } = await supabase
    .from('locations')
    .insert({ customer_id: customerId, location_name: displayName })
    .select('id, location_name')
    .single();
  if (error) throw new Error(`Failed to create location: ${error.message}`);

  if (clRow?.id) {
    await supabase.from('customer_location').update({ location_id: created.id }).eq('id', clRow.id);
  }

  return { id: created.id, address: displayName };
}

function buildJobDescription(contract, slot) {
  const parts = [];
  if (contract.quotation) parts.push(`Quotation: ${contract.quotation}`);
  if (contract.jobDescription) parts.push(contract.jobDescription);
  parts.push(slot.marker);
  return parts.join('\n');
}

async function insertJobSchedule(supabase, jobId, dateYmd, address) {
  const payload = {
    job_id: jobId,
    jsdate: dateYmd,
    jedate: dateYmd,
    jstime: '09:00:00',
    jetime: '12:30:00',
    dur_type: 'hours',
    dur: '3.50',
    address: address || null,
  };
  const { error } = await supabase.from('job_schedule').insert(payload);
  if (error) throw new Error(`Failed to create job_schedule: ${error.message}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    console.log('DRY RUN — no jobs, customers, or sales orders will be written.\n');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const { buildSingaporeDateTimeUtc } = await import('../lib/utils/singaporeDateTime.js');
  const { upsertSalesOrder } = await import('../lib/integrations/aifmSapIdentifiers.js');
  const sapService = (await import('../lib/services/sapService.js')).default;
  const {
    loginSessionCookiesFromEnvironment,
    unwrapSapEnvironmentLogin,
  } = await import('../lib/services/sapService.js');

  const sapLogin = await loginSessionCookiesFromEnvironment();
  const sessionCookies = unwrapSapEnvironmentLogin(sapLogin);
  if (!sessionCookies) {
    console.warn(`SAP login failed: ${sapLogin?.error || 'no cookies'} — C006103 sync will fail if customer missing`);
  } else {
    console.log('SAP Service Layer session OK');
  }

  const contracts = parseWorkbook(args.file);
  const allRows = flattenImportSlots(contracts);
  const filtered = applyFilters(allRows, args);

  const stats = { import: 0, skip: 0, exists: 0, created: 0, failed: 0 };
  const customerCache = new Map();
  const contractErrors = [];

  const importCandidates = filtered
    .filter(({ slot }) => slot.action === 'IMPORT' && slot.dateYmd)
    .sort((a, b) => {
      const diff = a.slot.dateYmd.localeCompare(b.slot.dateYmd);
      if (diff !== 0) return diff;
      return a.contract.invoice.localeCompare(b.contract.invoice);
    });

  let dryRunNextJobNo = args.dryRun ? await getNextJobNumber(supabase) : null;

  for (const { contract, slot } of filtered) {
    if (slot.action === 'SKIP') {
      stats.skip++;
      console.log(
        `SKIP  ${contract.bpCode} ${contract.invoice} ${slot.slot} — ${slot.skipReason}${slot.raw ? ` (${slot.raw.replace(/\r?\n/g, ' ').slice(0, 40)})` : ''}`
      );
      continue;
    }

    const existing = await markerExists(supabase, slot.marker);
    if (existing?.id) {
      stats.exists++;
      console.log(`EXISTS ${contract.bpCode} ${contract.invoice} ${slot.slot} ${slot.dateYmd} → ${existing.job_number}`);
      continue;
    }

    stats.import++;

    const jobNumberPreview = args.dryRun ? dryRunNextJobNo : '(next)';

    try {
      if (!sessionCookies) {
        const custCheck = await findCustomerByCode(supabase, contract.bpCode);
        if (!custCheck) {
          throw new Error(`Customer ${contract.bpCode} missing and SAP session unavailable`);
        }
      }

      const { customer, bpAddresses, sapSynced } = await resolveCustomer(
        supabase,
        sapService,
        sessionCookies,
        contract,
        customerCache,
        args.dryRun
      );

      const hints = {
        address: contract.address,
        unitNumber: contract.unitNumber,
        postalCode: contract.postalCode,
      };
      const location = customer.id
        ? await resolveLocation(supabase, customer.id, bpAddresses, hints, args.dryRun)
        : {
            id: null,
            address:
              formatAddressLikeServiceLocationTab(pickSapAddress(bpAddresses, hints)) ||
              hints.address ||
              '—',
            dryRunPlaceholder: true,
          };

      const scheduledStart = buildSingaporeDateTimeUtc(slot.dateYmd, 9, 0);
      const scheduledEnd = buildSingaporeDateTimeUtc(slot.dateYmd, 12, 30);

      const title = `Contract ${contract.invoice} ${slot.slot}`;
      const description = buildJobDescription(contract, slot);

      const sapNote = sapSynced
        ? args.dryRun
          ? ' [SAP customer would be created]'
          : ' [SAP customer created]'
        : '';
      console.log(
        `${args.dryRun ? 'IMPORT' : 'CREATE'} ${contract.bpCode} ${contract.invoice} ${slot.slot} ${slot.dateYmd} ${slot.priority} SO=${contract.salesOrder || '—'} job=${jobNumberPreview}${sapNote}`
      );

      if (args.dryRun) {
        if (contract.bpCode === 'C006103') {
          console.log(
            `  → C006103 SAP resolution: ${sapSynced ? 'would create customer from SAP' : 'portal customer + SAP BP lookup OK'}`
          );
        }
        const parts = dryRunNextJobNo.split('-');
        if (parts.length >= 2) {
          const num = parseInt(parts[1], 10) || 0;
          dryRunNextJobNo = `${parts[0]}-${String(num + 1).padStart(6, '0')}`;
        }
        continue;
      }

      const jobNumber = await getNextJobNumber(supabase);
      const job = await createJob(supabase, {
          customer_id: customer.id,
          location_id: location.id,
          service_call_id: null,
          job_number: jobNumber,
          title,
          description,
          priority: slot.priority,
          status: '554',
          scheduled_start: scheduledStart.toISOString(),
          scheduled_end: scheduledEnd.toISOString(),
          created_by: null,
        });

      await insertJobSchedule(supabase, job.id, slot.dateYmd, location.address);

      if (contract.salesOrder) {
        const soResult = await upsertSalesOrder({
          supabase,
          documentNumber: contract.salesOrder,
        });
        if (soResult?.id) {
          await supabase.from('jobs').update({ sales_order_id: soResult.id }).eq('id', job.id);
        }
      }

      stats.created++;
      console.log(`  ✓ ${job.job_number} id=${job.id}`);
    } catch (err) {
      stats.failed++;
      const msg = err?.message || String(err);
      contractErrors.push({ contract: contract.invoice, bp: contract.bpCode, slot: slot.slot, error: msg });
      console.error(`  ✗ ${contract.bpCode} ${contract.invoice} ${slot.slot}: ${msg}`);
    }
  }

  console.log('\nSummary:', {
    parsedContracts: contracts.length,
    importCandidates: importCandidates.length,
    import: stats.import,
    skip: stats.skip,
    exists: stats.exists,
    created: stats.created,
    failed: stats.failed,
    dryRun: args.dryRun,
  });

  if (contractErrors.length) {
    console.log('\nErrors:', contractErrors);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
