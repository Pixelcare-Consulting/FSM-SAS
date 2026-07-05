import { sanitizeAddressPart } from '../utils/formatPortalBpAddress.js';

/**
 * Ensure a portal site row (customer_location or sap_lead_location) is linked to
 * `locations.id`, creating the row when missing. Updates `locations.location_name`.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @param {string|null} params.customerId - `customer.id` for locations row; null for SAP leads
 * @param {'customer_location'|'sap_lead_location'} params.linkTable
 * @param {{ id: string, location_id?: string|null }} params.siteRow
 * @param {string} params.formattedAddressLine
 * @returns {Promise<string|null>} linked `locations.id`
 */
export async function ensureSiteLocationLink({
  supabase,
  customerId,
  linkTable,
  siteRow,
  formattedAddressLine,
}) {
  const name = sanitizeAddressPart(formattedAddressLine);
  if (!name) return siteRow.location_id || null;

  const now = new Date().toISOString();

  if (siteRow.location_id) {
    const { error } = await supabase
      .from('locations')
      .update({ location_name: name, updated_at: now })
      .eq('id', siteRow.location_id)
      .is('deleted_at', null);
    if (error) throw new Error(`locations patch ${siteRow.location_id}: ${error.message}`);
    return siteRow.location_id;
  }

  const insertRow = { location_name: name };
  if (customerId) insertRow.customer_id = customerId;

  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .insert(insertRow)
    .select('id')
    .single();
  if (locErr) throw new Error(`locations insert: ${locErr.message}`);

  const { error: linkErr } = await supabase
    .from(linkTable)
    .update({ location_id: loc.id })
    .eq('id', siteRow.id);
  if (linkErr) throw new Error(`${linkTable} link ${siteRow.id}: ${linkErr.message}`);

  return loc.id;
}
