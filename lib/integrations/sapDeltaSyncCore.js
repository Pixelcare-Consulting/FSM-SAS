import sapService from '../services/sapService.js';

export const MAX_ERROR_ITEMS = 10;
export const SAP_DELTA_PAGE_SIZE = 100;
export const SAP_DELTA_MAX_PAGES = 30;
export const PREVIEW_ITEMS_CAP = 75;

export function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start_date: fmt(start), end_date: fmt(end) };
}

export function normalizeCustomerCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

export function isOfficialSapCustomerCode(code) {
  return /^C[A-Z0-9]+$/.test(normalizeCustomerCode(code));
}

/** ISO yyyy-mm-dd → SAP BusinessPartners UpdateDate (yyyymmdd). */
export function toSapDate(isoDate) {
  return String(isoDate || '').trim().replace(/-/g, '');
}

export function sapHitFromBp(bp) {
  if (!bp?.CardCode) return null;
  const code = normalizeCustomerCode(bp.CardCode);
  if (!code) return null;
  return {
    cardCode: code,
    cardName: String(bp?.CardName || '').trim() || code,
    cardType: String(bp?.CardType || '').trim() || (code.startsWith('L') ? 'L' : 'C'),
  };
}

export function isLeadHit(hit) {
  return hit?.cardType === 'L' || String(hit?.cardCode || '').toUpperCase().startsWith('L');
}

export async function getTargetedSapHit(customerCode, sapCookies) {
  if (!customerCode || !sapCookies) return null;
  try {
    const bp = await sapService.getBusinessPartner(customerCode, sapCookies);
    return sapHitFromBp(bp);
  } catch {
    try {
      const escaped = customerCode.replace(/'/g, "''");
      const data = await sapService.getBusinessPartners(
        {
          top: 1,
          filter: `CardCode eq '${escaped}'`,
          select: 'CardCode,CardName,CardType',
          quiet: true,
        },
        sapCookies
      );
      const row = Array.isArray(data?.value) ? data.value[0] : null;
      return sapHitFromBp(row);
    } catch {
      return null;
    }
  }
}

/**
 * SAP Service Layer delta: Business Partners (customers + leads) changed in date range.
 */
export async function fetchSapBusinessPartnersInRange(sapCookies, startDate, endDate) {
  const start = toSapDate(startDate);
  const end = toSapDate(endDate);
  if (!start || !end) {
    return { hits: [], error: 'Invalid date range' };
  }

  const filter = `(CardType eq 'C' or CardType eq 'L') and UpdateDate ge '${start}' and UpdateDate le '${end}'`;
  const hits = [];
  const seen = new Set();
  let pagesFetched = 0;

  for (let page = 0; page < SAP_DELTA_MAX_PAGES; page++) {
    let data;
    try {
      data = await sapService.getBusinessPartners(
        {
          skip: page * SAP_DELTA_PAGE_SIZE,
          top: SAP_DELTA_PAGE_SIZE,
          filter,
          select: 'CardCode,CardName,CardType,UpdateDate',
          orderby: 'UpdateDate asc',
          quiet: page > 0,
        },
        sapCookies
      );
    } catch (error) {
      if (page === 0) {
        return { hits: [], error: error?.message || 'SAP BusinessPartners query failed' };
      }
      break;
    }

    pagesFetched = page + 1;
    const rows = Array.isArray(data?.value) ? data.value : [];
    if (!rows.length) break;

    for (const bp of rows) {
      const hit = sapHitFromBp(bp);
      if (!hit || seen.has(hit.cardCode)) continue;
      seen.add(hit.cardCode);
      hits.push(hit);
    }

    if (rows.length < SAP_DELTA_PAGE_SIZE) break;
  }

  return { hits, pagesFetched };
}

export function customersWrittenCount(summary) {
  return (
    (summary?.counts?.masterlistCustomersInserted || 0) +
    (summary?.counts?.masterlistCustomersUpdated || 0) +
    (summary?.counts?.masterlistLeadsInserted || 0) +
    (summary?.counts?.masterlistLeadsUpdated || 0)
  );
}

export function applyMasterlistSummary(summary, masterlistSummary) {
  summary.counts.masterlistCustomersInserted = masterlistSummary?.customers?.inserted || 0;
  summary.counts.masterlistCustomersUpdated = masterlistSummary?.customers?.updated || 0;
  summary.counts.masterlistLeadsInserted = masterlistSummary?.leads?.inserted || 0;
  summary.counts.masterlistLeadsUpdated = masterlistSummary?.leads?.updated || 0;
  if (masterlistSummary?.locations) {
    summary.locations = masterlistSummary.locations;
  }
  if (Array.isArray(masterlistSummary?.locationWarnings) && masterlistSummary.locationWarnings.length) {
    summary.locationWarnings = masterlistSummary.locationWarnings;
  }
  if (Array.isArray(masterlistSummary?.errors) && masterlistSummary.errors.length) {
    summary.errors.push(
      ...masterlistSummary.errors
        .slice(0, MAX_ERROR_ITEMS)
        .map((e) => `Masterlist ${e.cardCode}: ${e.error}`)
    );
  }
}
