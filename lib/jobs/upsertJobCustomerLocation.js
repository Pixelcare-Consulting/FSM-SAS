import {
  normalizeAddressTypeKey,
  siteAddressLookupKeys,
} from '../utils/siteAddressKeyAliases';

function normalizePortalAddressType(raw) {
  const t = normalizeAddressTypeKey(raw);
  if (t === 'B') return 'bo_BillTo';
  if (t === 'S') return 'bo_ShipTo';
  return raw || null;
}

function portalTypesMatch(a, b) {
  const left = normalizePortalAddressType(a);
  const right = normalizePortalAddressType(b);
  if (!left || !right) return true;
  return left === right;
}

export function siteIdFromSelectedLocation(selectedLocation) {
  if (!selectedLocation) return null;
  return (
    selectedLocation.value ||
    selectedLocation.siteId ||
    selectedLocation.site_id ||
    null
  );
}

const GUARDED_ADDRESS_FIELDS = [
  'address',
  'street',
  'building',
  'block',
  'street_number',
  'city',
  'zip_code',
];

function isBareSiteLabel(value, siteId) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  const s = String(siteId == null ? '' : siteId).trim().toLowerCase();
  if (!v) return true;
  return v === s;
}

/**
 * Don't clobber a richer existing customer_location address with a bare site label.
 * Mirrors the "don't blank richer values" merge in ensurePortalCustomerAddressFromLead.
 */
function mergeAgainstExistingLocationRow(existing, incoming, siteId) {
  if (!existing) return incoming;
  const merged = { ...incoming };
  for (const field of GUARDED_ADDRESS_FIELDS) {
    const next = String(incoming[field] == null ? '' : incoming[field]).trim();
    const cur = String(existing[field] == null ? '' : existing[field]).trim();
    const nextIsBare = !next || isBareSiteLabel(next, siteId);
    const curIsRicher = cur && !isBareSiteLabel(cur, siteId) && cur.length >= next.length;
    if (nextIsBare && curIsRicher) {
      merged[field] = existing[field];
    }
  }
  return merged;
}

function buildCustomerLocationPayload(locationId, selectedLocation) {
  return {
    location_id: locationId,
    building: selectedLocation.building || null,
    street_number: selectedLocation.streetNo || selectedLocation.street_number || null,
    street: selectedLocation.street || null,
    block: selectedLocation.block || null,
    address: selectedLocation.address || null,
    city: selectedLocation.city || null,
    country_name: selectedLocation.countryName || selectedLocation.country_name || null,
    zip_code: selectedLocation.zipCode || selectedLocation.zip_code || null,
    address_type: normalizePortalAddressType(selectedLocation.addressType) || null,
  };
}

/**
 * Prefer masterlist row (portalLocationId) then site_id + address_type, including ` - 1` / alias variants.
 */
export async function findCustomerLocationRow(
  supabase,
  { customerId, siteId, addressType, portalLocationId },
) {
  if (!customerId) return null;

  const detailColumns =
    'id, site_id, address_type, address, street, building, block, street_number, city, zip_code';

  if (portalLocationId) {
    const { data, error } = await supabase
      .from('customer_location')
      .select(detailColumns)
      .eq('id', portalLocationId)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data;
  }

  if (!siteId) return null;

  const siteVariants = siteAddressLookupKeys(siteId, addressType);
  const { data: rows, error } = await supabase
    .from('customer_location')
    .select(detailColumns)
    .eq('customer_id', customerId)
    .in('site_id', siteVariants.length > 0 ? siteVariants : [siteId]);
  if (error) throw error;
  if (!rows?.length) return null;

  const exact = rows.find(
    (row) => row.site_id === siteId && portalTypesMatch(row.address_type, addressType),
  );
  if (exact) return exact;

  if (addressType) {
    const byType = rows.find((row) => portalTypesMatch(row.address_type, addressType));
    if (byType) return byType;
  }

  return rows.find((row) => row.site_id === siteId) || rows[0];
}

/**
 * Link jobs.locations row to customer_location — prefer existing masterlist row over site_id-only match.
 */
export async function upsertJobCustomerLocation(supabase, { customerId, locationId, selectedLocation }) {
  const siteId = siteIdFromSelectedLocation(selectedLocation);
  if (!customerId || !locationId || !siteId) {
    return { customerLocationId: null };
  }

  const addressType = selectedLocation.addressType || selectedLocation.address_type;
  const portalLocationId =
    selectedLocation.portalLocationId || selectedLocation.PortalLocationId || null;

  const existing = await findCustomerLocationRow(supabase, {
    customerId,
    siteId,
    addressType,
    portalLocationId,
  });

  const payload = buildCustomerLocationPayload(locationId, selectedLocation);

  if (existing?.id) {
    const merged = mergeAgainstExistingLocationRow(existing, payload, siteId);
    const { error: updateError } = await supabase
      .from('customer_location')
      .update(merged)
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return { customerLocationId: existing.id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('customer_location')
    .insert({
      customer_id: customerId,
      site_id: siteId,
      ...payload,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return { customerLocationId: inserted?.id || null };
}
