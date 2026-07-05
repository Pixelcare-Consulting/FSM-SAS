import { resolvePortalCustomerForPromotion } from '../customers/promotePortalCustomerFromSap.js';
import { fetchBpDetails } from './aifmSapMasterlistSync.js';
import { enrichPreviewItemsWithAddresses } from './sapDeltaSyncAddressPreview.js';
import {
  defaultDateRange,
  fetchSapBusinessPartnersInRange,
  getTargetedSapHit,
  isLeadHit,
  isOfficialSapCustomerCode,
  MAX_ERROR_ITEMS,
  normalizeCustomerCode,
  PREVIEW_ITEMS_CAP,
} from './sapDeltaSyncCore.js';

const BATCH_LOOKUP_SIZE = 200;

function emptyCounts() {
  return {
    sapHits: 0,
    sapPagesFetched: 0,
    promotions: 0,
    customersToInsert: 0,
    customersToUpdate: 0,
    leadsToInsert: 0,
    leadsToUpdate: 0,
  };
}

function buildPreviewItem({ hit, action, entityType, portalCode = null, existingName = null, note = null }) {
  return {
    cardCode: hit.cardCode,
    cardName: hit.cardName || existingName || hit.cardCode,
    cardType: hit.cardType || (isLeadHit(hit) ? 'L' : 'C'),
    entityType,
    action,
    portalCode,
    existingName,
    note,
  };
}

async function lookupPortalCustomerName(supabase, portalCode) {
  const code = normalizeCustomerCode(portalCode);
  if (!code) return null;
  const { data, error } = await supabase
    .from('customer')
    .select('customer_name')
    .eq('customer_code', code)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`Portal customer lookup failed: ${error.message}`);
  return data?.customer_name || null;
}

async function batchLookupMasterlistCodes(supabase, hits) {
  const customerCodes = [...new Set(hits.filter((h) => !isLeadHit(h)).map((h) => h.cardCode))];
  const leadCodes = [...new Set(hits.filter((h) => isLeadHit(h)).map((h) => h.cardCode))];

  const existingCustomers = new Map();
  const existingLeads = new Map();

  for (let i = 0; i < customerCodes.length; i += BATCH_LOOKUP_SIZE) {
    const chunk = customerCodes.slice(i, i + BATCH_LOOKUP_SIZE);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from('customer')
      .select('customer_code, customer_name')
      .in('customer_code', chunk)
      .is('deleted_at', null);
    if (error) throw new Error(`Customer batch lookup failed: ${error.message}`);
    for (const row of data || []) {
      existingCustomers.set(normalizeCustomerCode(row.customer_code), row.customer_name || null);
    }
  }

  for (let i = 0; i < leadCodes.length; i += BATCH_LOOKUP_SIZE) {
    const chunk = leadCodes.slice(i, i + BATCH_LOOKUP_SIZE);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from('sap_lead')
      .select('lead_code, lead_name')
      .in('lead_code', chunk)
      .is('deleted_at', null);
    if (error) throw new Error(`SAP lead batch lookup failed: ${error.message}`);
    for (const row of data || []) {
      existingLeads.set(normalizeCustomerCode(row.lead_code), row.lead_name || null);
    }
  }

  return { existingCustomers, existingLeads };
}

function previewItemsFromHits(hits, existingCustomers, existingLeads) {
  const items = [];
  const counts = emptyCounts();
  counts.sapHits = hits.length;

  for (const hit of hits) {
    const lead = isLeadHit(hit);
    if (lead) {
      const existingName = existingLeads.get(hit.cardCode) || null;
      const action = existingName ? 'update' : 'insert';
      if (action === 'insert') counts.leadsToInsert += 1;
      else counts.leadsToUpdate += 1;
      items.push(
        buildPreviewItem({
          hit,
          action,
          entityType: 'lead',
          existingName,
        })
      );
    } else {
      const existingName = existingCustomers.get(hit.cardCode) || null;
      const action = existingName ? 'update' : 'insert';
      if (action === 'insert') counts.customersToInsert += 1;
      else counts.customersToUpdate += 1;
      items.push(
        buildPreviewItem({
          hit,
          action,
          entityType: 'customer',
          existingName,
        })
      );
    }
  }

  return { items, counts };
}

/**
 * Dry-run SAP delta sync — reads SAP + Supabase only, no writes or audit logs.
 *
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   sessionCookies: object,
 *   customerCode?: string,
 *   portalCustomerCode?: string,
 *   start_date?: string,
 *   end_date?: string,
 * }} params
 */
export async function previewSapDeltaSync({
  supabase,
  sessionCookies,
  customerCode: rawCustomerCode,
  portalCustomerCode: rawPortalCustomerCode,
  start_date,
  end_date,
}) {
  const customerCode = normalizeCustomerCode(rawCustomerCode);
  const portalCustomerCode = normalizeCustomerCode(rawPortalCustomerCode);
  const range = {
    start_date: String(start_date || '').trim(),
    end_date: String(end_date || '').trim(),
  };
  if (!range.start_date || !range.end_date) {
    const d = defaultDateRange();
    range.start_date = range.start_date || d.start_date;
    range.end_date = range.end_date || d.end_date;
  }

  const preview = {
    mode: customerCode && portalCustomerCode ? 'promotion' : customerCode ? 'targeted' : 'sap_delta',
    customerCode: customerCode || null,
    portalCustomerCode: portalCustomerCode || null,
    dateRange: range,
    counts: emptyCounts(),
    items: [],
    itemsTruncated: false,
    errors: [],
  };

  if (!sessionCookies) {
    preview.errors.push(
      'SAP Service Layer login failed — preview requires a live SAP session. Check SAP_B1_* env vars.'
    );
    return preview;
  }

  if (customerCode && isOfficialSapCustomerCode(customerCode)) {
    let resolvedPortalCode = portalCustomerCode || null;
    let promotionResolved = portalCustomerCode ? 'explicit' : null;

    if (!resolvedPortalCode) {
      resolvedPortalCode = await resolvePortalCustomerForPromotion(supabase, customerCode, sessionCookies);
      if (resolvedPortalCode) promotionResolved = 'auto';
    }

    if (resolvedPortalCode) {
      const details = await fetchBpDetails(customerCode, sessionCookies);
      const portalName = await lookupPortalCustomerName(supabase, resolvedPortalCode);
      preview.mode = 'promotion';
      preview.promotionResolved = promotionResolved;
      preview.counts.sapHits = 1;
      preview.counts.promotions = 1;
      preview.items = await enrichPreviewItemsWithAddresses({
        supabase,
        sessionCookies,
        items: [
          buildPreviewItem({
            hit: {
              cardCode: customerCode,
              cardName: details?.cardName || portalName || customerCode,
              cardType: 'C',
            },
            action: 'promote',
            entityType: 'customer',
            portalCode: resolvedPortalCode,
            existingName: portalName,
            note: 'Portal CP customer will be promoted in place (jobs stay linked)',
          }),
        ],
      });
      return preview;
    }
  }

  if (customerCode) {
    const targetedHit = await getTargetedSapHit(customerCode, sessionCookies);
    if (!targetedHit) {
      preview.errors.push(
        `SAP Business Partner ${customerCode} not found on Service Layer (check company DB / CardCode).`
      );
      return preview;
    }

    preview.counts.sapHits = 1;
    const { existingCustomers, existingLeads } = await batchLookupMasterlistCodes(supabase, [targetedHit]);
    const { items, counts } = previewItemsFromHits([targetedHit], existingCustomers, existingLeads);
    preview.items = await enrichPreviewItemsWithAddresses({ supabase, sessionCookies, items });
    preview.counts = { ...preview.counts, ...counts };
    return preview;
  }

  const sapScan = await fetchSapBusinessPartnersInRange(sessionCookies, range.start_date, range.end_date);
  if (sapScan.error) {
    preview.errors.push(`SAP delta query: ${sapScan.error}`);
  }
  preview.counts.sapPagesFetched = sapScan.pagesFetched || 0;
  preview.counts.sapHits = sapScan.hits.length;

  if (!sapScan.hits.length) {
    return preview;
  }

  const { existingCustomers, existingLeads } = await batchLookupMasterlistCodes(supabase, sapScan.hits);
  const { items, counts } = previewItemsFromHits(sapScan.hits, existingCustomers, existingLeads);
  preview.counts = { ...preview.counts, ...counts };

  const cappedItems = items.length > PREVIEW_ITEMS_CAP ? items.slice(0, PREVIEW_ITEMS_CAP) : items;
  preview.itemsTruncated = items.length > PREVIEW_ITEMS_CAP;
  preview.items = await enrichPreviewItemsWithAddresses({
    supabase,
    sessionCookies,
    items: cappedItems,
  });

  preview.errors = preview.errors.filter(Boolean).slice(0, MAX_ERROR_ITEMS);
  return preview;
}
