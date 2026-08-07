import { resolveCustomerAddressDetailRow } from '../utils/siteAddressKeyAliases.js';

/**
 * Resolve customer_address_details.status for a job-form location option.
 * Missing detail row => Active (same as Service Locations UI).
 *
 * @param {{ data?: Record<string, unknown>, dataByCustomerLocationId?: Record<string, unknown> }|null|undefined} maps
 * @param {Record<string, unknown>|null|undefined} loc
 * @returns {string}
 */
export function resolveJobFormLocationStatus(maps, loc) {
  if (!loc || typeof loc !== 'object') return 'Active';

  const portalLocationId =
    loc.portalLocationId || loc.PortalLocationId || loc.customer_location_id || null;

  const detail = resolveCustomerAddressDetailRow(
    maps?.data || {},
    maps?.dataByCustomerLocationId || {},
    {
      PortalLocationId: portalLocationId,
      customer_location_id: portalLocationId,
      id: portalLocationId || loc.id || null,
      AddressName: loc.siteId || loc.AddressName || loc.value || loc.locationName,
      site_id: loc.siteId || loc.site_id,
      SiteID: loc.siteId || loc.SiteID,
      AddressType: loc.addressType || loc.AddressType || loc.address_type,
      Street: loc.street || loc.Street,
      PortalFullAddress: loc.address || loc.PortalFullAddress,
      BuildingFloorRoom: loc.building || loc.BuildingFloorRoom,
    }
  );

  const status = String(detail?.status ?? '').trim();
  return status || 'Active';
}

/**
 * @param {Record<string, unknown>} loc
 * @param {{ data?: Record<string, unknown>, dataByCustomerLocationId?: Record<string, unknown> }|null|undefined} maps
 */
export function withLocationOptionStatus(loc, maps) {
  if (!loc || typeof loc !== 'object') return loc;
  return {
    ...loc,
    status: resolveJobFormLocationStatus(maps, loc),
  };
}

/**
 * @param {Array<Record<string, unknown>>} locations
 * @param {{ data?: Record<string, unknown>, dataByCustomerLocationId?: Record<string, unknown> }|null|undefined} maps
 */
export function withLocationOptionsStatuses(locations, maps) {
  if (!Array.isArray(locations)) return [];
  return locations.map((loc) => withLocationOptionStatus(loc, maps));
}
