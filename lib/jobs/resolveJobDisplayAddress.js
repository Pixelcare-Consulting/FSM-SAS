import { extractTag } from '../integrations/aifmDescriptionTags.js';
import { sanitizeAddressPart } from '../utils/formatPortalBpAddress.js';

/**
 * One-line address from customer_location, locations row, or nested address object.
 */
export function formatLocationRecordAsSingleLine(loc) {
  if (!loc || typeof loc !== 'object') return '';

  const building = sanitizeAddressPart(loc.building);
  const block = sanitizeAddressPart(loc.block);
  const countryName = sanitizeAddressPart(loc.country_name || loc.country);
  const zipCode = sanitizeAddressPart(loc.zip_code);
  const city = sanitizeAddressPart(loc.city);
  const state = sanitizeAddressPart(loc.state || loc.state_province);

  const numberedStreet = [loc.street_number, loc.street]
    .map((p) => sanitizeAddressPart(p))
    .filter(Boolean)
    .join(' ');

  let streetAddress = '';
  const rawAddr = loc.street ?? loc.address ?? loc.location_name ?? loc.locationName;
  if (typeof rawAddr === 'string') {
    streetAddress = sanitizeAddressPart(rawAddr);
  } else if (rawAddr && typeof rawAddr === 'object') {
    const a = rawAddr;
    streetAddress = [
      a.streetNo || a.street_number,
      a.streetAddress || a.street,
      a.block,
      a.buildingNo || a.building,
      a.city,
      a.stateProvince || a.state,
      a.postalCode || a.zip_code,
      a.country,
    ]
      .map((p) => sanitizeAddressPart(p))
      .filter(Boolean)
      .join(', ');
  }

  if (!streetAddress && numberedStreet) {
    streetAddress = numberedStreet;
  }

  const formattedCountry =
    String(countryName).toUpperCase() === 'SG' || String(countryName).toLowerCase() === 'singapore'
      ? 'Singapore'
      : countryName || '';

  return [streetAddress, building, block, city, state, formattedCountry, zipCode]
    .filter(Boolean)
    .join(', ');
}

/** Match customer_location row to a job's linked location. */
export function matchCustomerLocation(customerLocations, jobLocationId, jobLocationName) {
  if (!Array.isArray(customerLocations) || customerLocations.length === 0) return null;

  if (jobLocationId) {
    const byId = customerLocations.find((cl) => cl.location_id === jobLocationId);
    if (byId) return byId;
  }

  const locName = (jobLocationName || '').trim().toLowerCase();
  if (locName) {
    const byName = customerLocations.find((cl) => {
      const sid = String(cl.site_id || '').trim().toLowerCase();
      const bld = String(cl.building || '').trim().toLowerCase();
      return (sid && locName.includes(sid)) || (bld && locName.includes(bld));
    });
    if (byName) return byName;
  }

  return null;
}

/**
 * Resolve a display address for job list/history rows.
 * Priority: [ADDRESS:] tag → customer_location (full) → locations.location_name → job_schedule → customer_location fallback.
 */
export function resolveJobDisplayAddress(job, context = {}) {
  const description = job.description || job.jobDescription || '';
  const tagAddress = extractTag(description, 'ADDRESS');
  if (tagAddress) {
    return tagAddress.replace(/\s+/g, ' ').trim();
  }

  const locationName = (job.location?.location_name || job.location?.locationName || '').trim();
  const jobLocationId = job.location?.id || job.location_id;

  const matched = matchCustomerLocation(
    context.customerLocations,
    jobLocationId,
    locationName
  );
  if (matched) {
    const customerLine = formatLocationRecordAsSingleLine(matched);
    if (customerLine && (!locationName || customerLine.length > locationName.length)) {
      return customerLine;
    }
  }

  if (locationName) return locationName;

  const scheduleAddress = (context.scheduleAddress ?? job.scheduleAddress ?? '').trim();
  if (scheduleAddress) return scheduleAddress;

  if (matched) {
    return formatLocationRecordAsSingleLine(matched);
  }

  return '';
}
