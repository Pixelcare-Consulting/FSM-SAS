import { siteAddressLookupKeys } from '../utils/siteAddressKeyAliases.js';

/**
 * Build lookup maps from `customer_address_details` rows (same shape as address-details GET API).
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 */
export function buildAddressDetailsMaps(rows) {
  const data = {};
  const dataByCustomerLocationId = {};
  if (!Array.isArray(rows)) {
    return { data, dataByCustomerLocationId };
  }

  for (const detail of rows) {
    if (detail.address_name) {
      for (const key of siteAddressLookupKeys(detail.address_name, detail.address_type)) {
        if (key) data[key] = detail;
      }
    }
    if (detail.customer_location_id) {
      dataByCustomerLocationId[detail.customer_location_id] = detail;
    }
  }

  return { data, dataByCustomerLocationId };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} customerCode
 */
export async function fetchAddressDetailsMaps(supabase, customerCode) {
  const code = String(customerCode || '').trim();
  if (!code) {
    return { data: {}, dataByCustomerLocationId: {} };
  }

  const { data, error } = await supabase
    .from('customer_address_details')
    .select('*')
    .eq('customer_code', code)
    .is('deleted_at', null);

  if (error) throw error;
  return buildAddressDetailsMaps(data);
}
