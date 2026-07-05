import { sanitizeAddressPart } from '../utils/formatPortalBpAddress.js';
import { ensureSiteLocationLink } from './ensureSiteLocationLink.js';
import { propagateSiteAddressToJobs } from './propagateSiteAddressToJobs.js';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  buildChanges,
} from '../services/auditLog.js';

const SITE_SELECT =
  'id, site_id, address_type, address, location_id, street, building, block';

function buildServiceLocationSnapshot(row) {
  if (!row) {
    return {
      siteId: null,
      addressType: null,
      address: null,
      street: null,
      building: null,
      block: null,
    };
  }
  return {
    siteId: row.site_id ?? null,
    addressType: row.address_type ?? null,
    address: row.address ?? null,
    street: row.street ?? null,
    building: row.building ?? null,
    block: row.block ?? null,
  };
}

function normalizeAddressTypeInput(value) {
  const t = String(value ?? '').trim();
  if (!t || t.toLowerCase() === 'other') return null;
  return t;
}

/**
 * Update portal masterlist site row and cascade address to linked jobs.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @param {import('http').IncomingMessage} [params.req]
 * @param {'customer_location'|'sap_lead_location'} params.table
 * @param {string} params.locationId
 * @param {string} params.ownerCode - customer_code or lead_code
 * @param {'customer'|'lead'} params.ownerKind
 * @param {string} params.addressName
 * @param {string} [params.addressType]
 * @param {string} params.fullAddress
 */
export async function updatePortalServiceLocation({
  supabase,
  req,
  table,
  locationId,
  ownerCode,
  ownerKind,
  addressName,
  addressType,
  fullAddress,
}) {
  const siteId = sanitizeAddressPart(addressName);
  const addressLine = sanitizeAddressPart(fullAddress);
  const resolvedAddressType = normalizeAddressTypeInput(addressType);

  if (!siteId) {
    throw new Error('addressName is required');
  }
  if (!addressLine) {
    throw new Error('fullAddress is required');
  }

  let customerId = null;
  let ownerEntityId = null;
  let ownerLabel = ownerCode;
  let siteRow = null;

  if (ownerKind === 'customer' || table === 'customer_location') {
    const { data: customer, error: custErr } = await supabase
      .from('customer')
      .select('id, customer_code')
      .eq('customer_code', ownerCode)
      .is('deleted_at', null)
      .maybeSingle();
    if (custErr) throw new Error(`customer lookup: ${custErr.message}`);
    if (!customer?.id) throw new Error('Customer not found');

    customerId = customer.id;
    ownerEntityId = customer.id;
    ownerLabel = customer.customer_code;

    const { data: row, error: locErr } = await supabase
      .from('customer_location')
      .select(SITE_SELECT)
      .eq('id', locationId)
      .eq('customer_id', customer.id)
      .maybeSingle();
    if (locErr) throw new Error(`customer_location lookup: ${locErr.message}`);
    if (!row?.id) throw new Error('Service location not found for this customer');
    siteRow = row;
  } else {
    const { data: lead, error: leadErr } = await supabase
      .from('sap_lead')
      .select('id, lead_code')
      .eq('lead_code', ownerCode)
      .is('deleted_at', null)
      .maybeSingle();
    if (leadErr) throw new Error(`sap_lead lookup: ${leadErr.message}`);
    if (!lead?.id) throw new Error('SAP lead not found in masterlist');

    ownerEntityId = lead.id;
    ownerLabel = lead.lead_code;

    const { data: row, error: locErr } = await supabase
      .from('sap_lead_location')
      .select(SITE_SELECT)
      .eq('id', locationId)
      .eq('sap_lead_id', lead.id)
      .maybeSingle();
    if (locErr) throw new Error(`sap_lead_location lookup: ${locErr.message}`);
    if (!row?.id) throw new Error('Service location not found for this lead');
    siteRow = row;
  }

  const beforeSnapshot = buildServiceLocationSnapshot(siteRow);

  const patch = {
    site_id: siteId,
    address: addressLine,
    // Full-address portal edits are authoritative; clear SAP component fields so
    // resolveCustomerLocationStreet / grid display use `address` not stale `street`.
    street: null,
    building: null,
    block: null,
  };
  if (addressType !== undefined) {
    patch.address_type = resolvedAddressType;
  }

  const { data: updatedSite, error: patchErr } = await supabase
    .from(table)
    .update(patch)
    .eq('id', siteRow.id)
    .select(SITE_SELECT)
    .single();
  if (patchErr) throw new Error(`site update: ${patchErr.message}`);

  const linkedLocationId = await ensureSiteLocationLink({
    supabase,
    customerId,
    linkTable: table,
    siteRow: { id: updatedSite.id, location_id: updatedSite.location_id },
    formattedAddressLine: addressLine,
  });

  const refreshedSite = linkedLocationId && !updatedSite.location_id
    ? { ...updatedSite, location_id: linkedLocationId }
    : updatedSite;

  const propagation = linkedLocationId
    ? await propagateSiteAddressToJobs(supabase, linkedLocationId, addressLine)
    : { locationUpdated: false, jobsMatched: 0, schedulesUpdated: 0 };

  const afterSnapshot = buildServiceLocationSnapshot({
    ...refreshedSite,
    site_id: siteId,
    address_type: resolvedAddressType,
    address: addressLine,
  });

  const changes = buildChanges(beforeSnapshot, afterSnapshot);
  const isLead = ownerKind === 'lead' || table === 'sap_lead_location';

  if (req) {
    await writeAuditLogFromRequest(req, {
      action: isLead ? AUDIT_ACTIONS.LEAD_UPDATE : AUDIT_ACTIONS.CUSTOMER_UPDATE,
      category: isLead ? AUDIT_CATEGORIES.LEAD : AUDIT_CATEGORIES.CUSTOMER,
      entityType: isLead ? 'lead' : 'customer',
      entityId: ownerEntityId,
      entityLabel: ownerLabel,
      description: `Service location updated for ${ownerLabel}`,
      details: {
        subAction: 'update_service_location',
        locationId: siteRow.id,
        linkedLocationId: linkedLocationId || null,
        jobsMatched: propagation.jobsMatched,
        schedulesUpdated: propagation.schedulesUpdated,
      },
      changes,
      status: AUDIT_STATUS.SUCCESS,
    });
  }

  return {
    success: true,
    locationId: siteRow.id,
    linkedLocationId: linkedLocationId || refreshedSite.location_id || null,
    siteId,
    addressType: resolvedAddressType,
    address: addressLine,
    jobsMatched: propagation.jobsMatched,
    schedulesUpdated: propagation.schedulesUpdated,
    locationUpdated: propagation.locationUpdated,
  };
}
