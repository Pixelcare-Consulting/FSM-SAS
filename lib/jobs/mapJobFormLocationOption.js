import {
  buildSharedLocationIdSet,
  resolveCustomerLocationStreet,
} from '../customers/supabaseCustomerSapShim.js';
import {
  resolveSapBuildingLine,
  sapAddressToLocationRow,
} from '../integrations/sapAddressLocationHelpers.js';
import { sanitizeAddressPart } from '../utils/formatPortalBpAddress.js';
import { formatLocationRecordAsSingleLine } from './resolveJobDisplayAddress.js';

function normalizeSapAddressType(addressType) {
  const t = String(addressType || '').trim().toUpperCase();
  if (t === 'B' || t === 'BO_BILLTO' || t === 'BILLTO') return 'B';
  if (t === 'S' || t === 'BO_SHIPTO' || t === 'SHIPTO') return 'S';
  return t || '';
}

function displayCountry(countryRaw) {
  if (countryRaw === 'SG') return 'Singapore';
  return sanitizeAddressPart(countryRaw);
}

/** Map one `customer_location` row (+ optional linked `locations`) to getLocation / job form shape. */
export function mapCustomerLocationToJobFormOption(cl, sharedLocationIds = null) {
  if (!cl || typeof cl !== 'object') return null;

  const siteId = sanitizeAddressPart(cl.site_id) || '';
  const buildingDirect = sanitizeAddressPart(cl.building);
  const street = resolveCustomerLocationStreet(cl, { sharedLocationIds });
  const building =
    buildingDirect ||
    resolveSapBuildingLine({
      AddressName: siteId,
      Street: street,
      Building: buildingDirect,
      BuildingFloorRoom: buildingDirect,
    }) ||
    '';
  const block = sanitizeAddressPart(cl.block);
  const streetNo = sanitizeAddressPart(cl.street_number);
  const city = sanitizeAddressPart(cl.city);
  const countryName = displayCountry(cl.country_name);
  const zipCode = sanitizeAddressPart(cl.zip_code);
  const address =
    sanitizeAddressPart(cl.address) ||
    formatLocationRecordAsSingleLine(cl) ||
    [street, building, block, city, countryName, zipCode].filter(Boolean).join(', ');

  return {
    siteId,
    building,
    streetNo,
    street,
    block,
    address,
    city,
    countryName,
    zipCode,
    addressType: normalizeSapAddressType(cl.address_type),
    portalLocationId: cl.id || null,
  };
}

/** Map customer bundle rows to job form location options. */
export function mapCustomerBundleToJobFormLocations(customerRow) {
  const locs = Array.isArray(customerRow?.customer_location)
    ? customerRow.customer_location
    : [];
  const sharedLocationIds = buildSharedLocationIdSet(locs);
  return locs
    .map((cl) => mapCustomerLocationToJobFormOption(cl, sharedLocationIds))
    .filter((loc) => loc && (loc.siteId || loc.address));
}

/** Map SAP-shaped BP address (masterlist shim or sql03) to job form location option. */
export function mapBpAddressToJobFormOption(addr) {
  if (!addr || typeof addr !== 'object') return null;

  const portalFull = sanitizeAddressPart(addr.PortalFullAddress);
  if (portalFull) {
    const siteId = sanitizeAddressPart(addr.SiteID || addr.AddressName);
    const building =
      sanitizeAddressPart(addr.Building || addr.BuildingFloorRoom) ||
      resolveSapBuildingLine(addr) ||
      '';
    return {
      siteId,
      building,
      streetNo: sanitizeAddressPart(addr.StreetNo) || '',
      street: portalFull,
      block: sanitizeAddressPart(addr.Block) || '',
      address: portalFull,
      city: sanitizeAddressPart(addr.City) || '',
      countryName: displayCountry(addr.CountryName || addr.Country),
      zipCode: sanitizeAddressPart(addr.ZipCode) || '',
      addressType: normalizeSapAddressType(addr.AddressType),
      portalLocationId: addr.PortalLocationId || null,
    };
  }

  const row = sapAddressToLocationRow(addr);
  return {
    siteId: row.site_id,
    building: row.building || '',
    streetNo: sanitizeAddressPart(addr.StreetNo) || '',
    street: row.street || '',
    block: row.block || '',
    address: row.address || '',
    city: row.city || '',
    countryName: row.country_name || '',
    zipCode: row.zip_code || '',
    addressType: normalizeSapAddressType(addr.AddressType),
    portalLocationId: addr.PortalLocationId || null,
  };
}

/** The bare site label of a location option (e.g. `11-#09-30`), never the full address. */
export function siteLabelFromLocationOption(selectedLocation) {
  const loc = selectedLocation || {};
  return String(loc.value || loc.siteId || loc.site_id || '').trim();
}

/** True when an address is empty or only the bare site label (no real street content). */
export function isBareSiteLabelAddress(addressValue, siteLabel) {
  const addr = String(addressValue == null ? '' : addressValue).trim().toLowerCase();
  const label = String(siteLabel == null ? '' : siteLabel).trim().toLowerCase();
  if (!addr) return true;
  return addr === label;
}

function richerString(a, b) {
  const sa = String(a == null ? '' : a).trim();
  const sb = String(b == null ? '' : b).trim();
  return sb.length > sa.length ? sb : sa;
}

/**
 * Merge a selected location option with the nested job-form `location.address`,
 * preferring the richer (longer, non-empty) value for each field. This keeps a
 * full street address from either source instead of letting a bare site label win.
 */
export function mergeSelectedLocationWithFormAddress(selectedLocation, formLocation) {
  const loc = selectedLocation || {};
  const addr = (formLocation && formLocation.address) || {};
  const street = richerString(loc.street, addr.streetAddress);
  return {
    ...loc,
    street,
    building: richerString(loc.building, addr.buildingNo),
    block: richerString(loc.block, addr.block),
    city: richerString(loc.city, addr.city),
    zipCode: richerString(loc.zipCode || loc.zip_code, addr.postalCode),
    streetNo: richerString(loc.streetNo || loc.street_number, addr.streetNo),
    countryName: richerString(loc.countryName || loc.country_name, addr.country),
    stateProvince: richerString(loc.stateProvince, addr.stateProvince),
    address: richerString(loc.address, street),
    addressType: loc.addressType || loc.address_type || '',
  };
}

/**
 * Parse a Singapore composite address line into granular parts.
 *
 * Portal/lead customers often store the whole address in one free-text string
 * (e.g. `customer_location.address`) with the granular columns NULL. This derives
 * the components so the Edit Job form can show Street No./Building No./Zip/Country.
 *
 * Tolerant by design: returns only the parts it can confidently derive and never
 * throws on unexpected input. Handles formats like:
 *   "7 DAIRY FARM WALK, #10-19 THE BOTANY, 679627"
 *   "11 DAIRY FARM WALK, #09-30 THE BOTANY, 679629, 11-#09-30"
 *
 * @param {unknown} composite
 * @returns {{ streetNo?: string, streetAddress?: string, buildingNo?: string, postalCode?: string, country?: string, city?: string }}
 */
export function parseSingaporeCompositeAddress(composite) {
  const line = sanitizeAddressPart(composite);
  if (!line) return {};

  const segments = line
    .split(',')
    .map((segment) => sanitizeAddressPart(segment))
    .filter(Boolean);
  if (segments.length === 0) return {};

  // Whitespace/comma tokenization so a 6-digit postal code is matched as a whole
  // token (avoids false positives inside longer numeric runs).
  const tokens = line
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const result = {};

  // Zip / Postal Code: a standalone 6-digit Singapore postal token.
  const postalToken = tokens.find((token) => /^\d{6}$/.test(token));
  if (postalToken) result.postalCode = postalToken;

  // Building No. / Unit: first segment starting with `#` (e.g. `#10-19 THE BOTANY`).
  // A trailing bare site label like `11-#09-30` does not start with `#`, so it is ignored.
  const unitSegment = segments.find((segment) => segment.startsWith('#'));
  if (unitSegment) result.buildingNo = unitSegment;

  // Require a real Singapore signal (postal code or `#unit`) before deriving the
  // remaining parts, so a bare site label is never mis-parsed into the form.
  if (!result.postalCode && !result.buildingNo) return {};

  // Street line: first segment that is not the unit and not a bare postal code.
  const streetSegment = segments.find(
    (segment) => !segment.startsWith('#') && !/^\d{6}$/.test(segment),
  );
  if (streetSegment) {
    result.streetAddress = streetSegment;
    const streetNoMatch = streetSegment.match(/^(\d+[A-Za-z]?)\b/);
    if (streetNoMatch) result.streetNo = streetNoMatch[1];
  }

  // Singapore is a city-state: default Country/City when a SG postal code is present.
  if (result.postalCode) {
    result.country = 'Singapore';
    result.city = 'Singapore';
  }

  return result;
}

/**
 * Fill ONLY the missing granular fields of a location option by parsing its
 * composite `address`/`street`. Never overwrites a value that already came from
 * the source columns — this is purely additive so it cannot regress the
 * bare-site-label save guard (it leaves `address`/`street` untouched when present).
 */
export function fillLocationOptionGranularFromComposite(option) {
  if (!option || typeof option !== 'object') return option;

  const composite =
    sanitizeAddressPart(option.address) || sanitizeAddressPart(option.street);
  if (!composite) return option;

  const parsed = parseSingaporeCompositeAddress(composite);
  const isBlank = (...values) => values.every((value) => !sanitizeAddressPart(value));

  const filled = { ...option };
  if (parsed.streetNo && isBlank(filled.streetNo, filled.street_number)) {
    filled.streetNo = parsed.streetNo;
  }
  if (parsed.streetAddress && isBlank(filled.street)) {
    filled.street = parsed.streetAddress;
  }
  if (parsed.buildingNo && isBlank(filled.building)) {
    filled.building = parsed.buildingNo;
  }
  if (parsed.postalCode && isBlank(filled.zipCode, filled.zip_code)) {
    filled.zipCode = parsed.postalCode;
  }
  if (parsed.country && isBlank(filled.countryName, filled.country_name)) {
    filled.countryName = parsed.country;
  }
  if (parsed.city && isBlank(filled.city)) {
    filled.city = parsed.city;
  }
  return filled;
}

/** Apply a location option to nested job form `location` state (Create/Edit Job). */
export function buildJobFormLocationPatch(selectedLocation, prevLocation = {}) {
  const loc = fillLocationOptionGranularFromComposite(selectedLocation || {});
  const street = loc.street || '';
  const building = loc.building || '';
  const siteLabel = loc.value || loc.siteId || loc.address || '';

  return {
    ...prevLocation,
    locationName: siteLabel,
    addressType: loc.addressType || '',
    address: {
      ...(prevLocation.address || {}),
      streetNo: loc.streetNo || '',
      streetAddress: street,
      block: loc.block || '',
      buildingNo: building,
      country: loc.countryName || '',
      stateProvince: loc.stateProvince || '',
      city: loc.city || '',
      postalCode: loc.zipCode || '',
      addressType: loc.addressType === 'B' ? 'Billing' : 'Shipping',
    },
    displayAddress: `${building ? `${building} - ` : ''}${loc.address || street}`,
    fullAddress: [siteLabel, street, building, loc.countryName, loc.zipCode]
      .filter(Boolean)
      .join(', '),
  };
}
