import {
  resolveCustomerAddressDetailRow,
  siteAddressLookupKeys,
} from './siteAddressKeyAliases';

/**
 * address_notes from customer_address_details: prefer FK map (customer_location.id), else string key map.
 */
export function getAddressNotesFromDetailsMap(loc, mapByName, mapByCustomerLocationId) {
  if (!loc) return '';

  const locId = loc.id || loc.PortalLocationId || loc.customer_location_id;
  const byId =
    mapByCustomerLocationId && typeof mapByCustomerLocationId === 'object'
      ? mapByCustomerLocationId
      : null;
  if (byId && locId) {
    const row = byId[locId];
    if (row?.address_notes != null && String(row.address_notes).trim() !== '') {
      return String(row.address_notes);
    }
  }

  const addressType = loc.AddressType || loc.address_type;
  const addressName =
    loc.AddressName || loc.address_name || loc.site_id || loc.SiteID || loc.value || null;

  const resolved = resolveCustomerAddressDetailRow(
    mapByName && typeof mapByName === 'object' ? mapByName : {},
    byId || {},
    {
      PortalLocationId: locId,
      AddressName: addressName,
      AddressType: addressType,
    },
  );
  if (resolved?.address_notes != null && String(resolved.address_notes).trim() !== '') {
    return String(resolved.address_notes);
  }

  if (!mapByName || typeof mapByName !== 'object') return '';
  const keys = [addressName, loc.site_id, loc.SiteID].filter(
    (k) => k != null && String(k).trim() !== '',
  );
  for (const k of keys) {
    for (const variant of siteAddressLookupKeys(k, addressType)) {
      const row = mapByName[variant];
      if (row?.address_notes != null && String(row.address_notes).trim() !== '') {
        return String(row.address_notes);
      }
    }
  }
  return '';
}

export function buildAddressDetailsMaps(addressDetailsRows) {
  const mapByName = {};
  const mapByCustomerLocationId = {};
  for (const detail of addressDetailsRows || []) {
    if (detail.address_name) {
      for (const key of siteAddressLookupKeys(detail.address_name, detail.address_type)) {
        if (key) mapByName[key] = detail;
      }
    }
    if (detail.customer_location_id) {
      mapByCustomerLocationId[detail.customer_location_id] = detail;
    }
  }
  return { mapByName, mapByCustomerLocationId };
}

/** Fetch and key `customer_address_details` rows for a customer or lead code. */
export async function fetchCustomerAddressDetailsMaps(admin, customerCode) {
  const code = customerCode != null ? String(customerCode).trim() : '';
  if (!code) {
    return { data: {}, dataByCustomerLocationId: {} };
  }

  const { data, error } = await admin
    .from('customer_address_details')
    .select('*')
    .eq('customer_code', code)
    .is('deleted_at', null);

  if (error) {
    throw error;
  }

  const { mapByName, mapByCustomerLocationId } = buildAddressDetailsMaps(data);
  return {
    data: mapByName,
    dataByCustomerLocationId: mapByCustomerLocationId,
  };
}

function getInlineAddressNotesFromLocation(loc) {
  if (!loc) return '';
  const inline =
    loc.AddressNotes || loc.addressNotes || loc.U_AddressNotes || loc.address_notes || '';
  return String(inline).trim();
}

function matchCustomerLocation(customerLocations, jobLocation) {
  if (!customerLocations?.length) return null;

  const jobLocationId = jobLocation?.id;
  if (jobLocationId) {
    const byId = customerLocations.find((cl) => cl.location_id === jobLocationId);
    if (byId) return byId;
  }

  if (jobLocation?.location_name) {
    const locName = String(jobLocation.location_name).trim().toLowerCase();
    return (
      customerLocations.find((cl) => {
        const sid = String(cl.site_id || '').trim().toLowerCase();
        const bld = String(cl.building || '').trim().toLowerCase();
        return (sid && locName.includes(sid)) || (bld && locName.includes(bld));
      }) || null
    );
  }

  return null;
}

/**
 * Resolve Address Notes for a job (same logic as job detail Customer Details panel).
 */
export async function resolveAddressNotesForJob(admin, jobData) {
  const jobLocation = jobData.location || jobData.customerLocation || null;
  let customerLocation = jobData.customerLocation || null;

  if (!customerLocation && jobData.customer_id) {
    try {
      const { data: customerLocations } = await admin
        .from('customer_location')
        .select('*')
        .eq('customer_id', jobData.customer_id);
      customerLocation = matchCustomerLocation(customerLocations, jobLocation);
    } catch (error) {
      console.warn('Error fetching customer_location for address notes:', error);
    }
  }

  const loc = customerLocation || jobLocation;
  const customerCode = jobData.customer?.customer_code || jobData.customerCode;

  if (customerCode) {
    try {
      const { data: addressDetails } = await admin
        .from('customer_address_details')
        .select('*')
        .eq('customer_code', customerCode)
        .is('deleted_at', null);

      const { mapByName, mapByCustomerLocationId } = buildAddressDetailsMaps(addressDetails);
      const fromMap = getAddressNotesFromDetailsMap(loc, mapByName, mapByCustomerLocationId);
      if (fromMap) return fromMap;
    } catch (error) {
      console.warn('Error fetching customer_address_details for address notes:', error);
    }
  }

  return getInlineAddressNotesFromLocation(loc);
}
