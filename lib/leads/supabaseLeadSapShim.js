/**
 * Map Supabase sap_lead + optional nested locations/contacts to the flattened SAP BusinessPartner-ish
 * shape used by pages/dashboard/leads/list.js (CardCode, CardName, Street, ContactPerson, …).
 */

import { sanitizeAddressPart, portalFullAddressFromDbRow } from '../utils/formatPortalBpAddress.js';

/** Global search — flat fields only. */
export const SUPABASE_SAP_LEAD_LIST_SEARCH_SELECT =
  'lead_code, lead_name, lead_address, phone_number, email';

/** Grid API — locations without contacts. */
export const SUPABASE_SAP_LEAD_GRID_SELECT = `
  lead_code,
  lead_name,
  lead_address,
  phone_number,
  email,
  sap_lead_location (
    id,
    site_id,
    building,
    street,
    address,
    city,
    country_name,
    zip_code,
    address_type
  )
`;

/** Grid / masterlist API — flat fields only. */
export const SUPABASE_SAP_LEAD_LIST_SUMMARY_SELECT = `
  lead_code,
  lead_name,
  lead_address,
  phone_number,
  email
`;

/** List page: embed contacts + location address fields (meaningful rows only used in listRowFromSupabaseSapLead). */
export const SUPABASE_SAP_LEAD_LIST_SELECT = `
  lead_code,
  lead_name,
  lead_address,
  phone_number,
  email,
  sap_lead_location (
    id,
    site_id,
    building,
    street,
    address,
    city,
    country_name,
    zip_code,
    address_type
  ),
  sap_lead_contact (
    sap_lead_location_id,
    first_name,
    middle_name,
    last_name,
    tel1,
    tel2,
    email
  )
`;

/** @deprecated Prefer SUPABASE_SAP_LEAD_LIST_SELECT — flat row leaves Contact Person empty. */
export const SUPABASE_SAP_LEAD_LIST_FLAT_SELECT =
  'lead_code, lead_name, lead_address, phone_number, email';

/** Detail / future: full graph (requires child-table SELECT policies). */
export const SUPABASE_SAP_LEAD_MASTERLIST_SELECT = `
  lead_code,
  lead_name,
  lead_address,
  phone_number,
  email,
  sap_lead_location (
    id,
    site_id,
    building,
    street,
    address,
    city,
    country_name,
    zip_code,
    address_type,
    location_id
  ),
  sap_lead_contact (
    id,
    sap_lead_location_id,
    first_name,
    middle_name,
    last_name,
    tel1,
    tel2,
    email
  )
`;

function displayCountryForLead(countryName) {
  const n = (countryName || '').trim();
  if (!n) return 'SG';
  return n.toLowerCase() === 'singapore' ? 'SG' : n;
}

function sapContactFromDbRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const c = rows[0];
  const first = (c.first_name || '').trim();
  const mid = (c.middle_name || '').trim();
  const last = (c.last_name || '').trim();
  const display = [first, mid, last].filter(Boolean).join(' ').trim();
  const phone = (c.tel1 || c.tel2 || '').toString().trim();
  return {
    Name: display || first || last || '—',
    FirstName: first,
    LastName: last || mid,
    Phone1: phone,
    Active: 'tYES',
    E_Mail: c.email || '',
  };
}

function portalSiteContactsFromDbRows(siteRows) {
  if (!Array.isArray(siteRows) || siteRows.length === 0) return [];
  return [...siteRows]
    .filter((c) => c && c.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((c) => {
      const first = (c.first_name || '').trim();
      const mid = (c.middle_name || '').trim();
      const last = (c.last_name || '').trim();
      const display = [first, mid, last].filter(Boolean).join(' ').trim();
      return {
        id: c.id,
        contactPerson: display || first || last || '',
        contactPhone: ((c.tel1 || c.tel2) || '').toString().trim(),
        contactEmail: (c.email || '').trim(),
      };
    });
}

function mapLeadLocationToBPAddress(cl, allContacts) {
  const t = (cl.address_type || '').toString().trim().toUpperCase();
  let addressType = '';
  if (t === 'B' || t === 'BO_BILLTO' || t === 'BILLTO') addressType = 'bo_BillTo';
  else if (t === 'S' || t === 'BO_SHIPTO' || t === 'SHIPTO') addressType = 'bo_ShipTo';
  else if (t) addressType = t;
  else addressType = 'bo_ShipTo';

  const atSite = (allContacts || []).filter((c) => c.sap_lead_location_id === cl.id);
  const pool = atSite.length ? atSite : (allContacts || []).filter((c) => !c.sap_lead_location_id);
  const LocationContact = sapContactFromDbRows(pool);

  const portalFull = portalFullAddressFromDbRow(cl);

  const row = {
    /** Supabase `sap_lead_location.id` — used for per-site contact PATCH. */
    PortalLocationId: cl.id || null,
    PortalContactCount: atSite.length,
    PortalSiteContacts: portalSiteContactsFromDbRows(atSite),
    PortalFullAddress: portalFull,
    AddressName: cl.site_id || '',
    SiteID: cl.site_id || '',
    Street: portalFull ? '' : sanitizeAddressPart(cl.street),
    Building: portalFull ? '' : sanitizeAddressPart(cl.building),
    BuildingFloorRoom: portalFull ? '' : sanitizeAddressPart(cl.building),
    ZipCode: cl.zip_code || '',
    City: cl.city || '',
    Country: 'SG',
    CountryName: cl.country_name || '',
    AddressType: addressType,
    Default: 'N',
    LocationContact,
  };
  if (LocationContact) {
    row.Name = LocationContact.Name;
    row.Phone1 = LocationContact.Phone1;
  }
  return row;
}

/**
 * BusinessPartner-shaped object for AccountInfoTab / ServiceLocationTab (SAP lead masterlist).
 */
export function sapPartnerFromSupabaseLeadBundle(row) {
  const locs = Array.isArray(row.sap_lead_location) ? row.sap_lead_location : [];
  const allContacts = Array.isArray(row.sap_lead_contact) ? row.sap_lead_contact : [];
  const customerLevelContacts = allContacts.filter((c) => !c.sap_lead_location_id);
  let BPAddresses = locs.map((cl) => mapLeadLocationToBPAddress(cl, allContacts));

  const flatAddr = (row.lead_address || '').trim();
  if (BPAddresses.length === 0 && flatAddr) {
    const unattached = (allContacts || []).filter((c) => !c.sap_lead_location_id);
    BPAddresses = [
      {
        PortalLocationId: null,
        PortalContactCount: unattached.length,
        AddressName: '',
        SiteID: '',
        Street: flatAddr,
        Building: '',
        BuildingFloorRoom: '',
        ZipCode: '',
        City: '',
        Country: 'SG',
        CountryName: 'Singapore',
        AddressType: 'bo_ShipTo',
        Default: 'N',
        LocationContact: sapContactFromDbRows(allContacts),
      },
    ];
  }

  let primaryEmployeeContact = sapContactFromDbRows(customerLevelContacts);
  if (!primaryEmployeeContact) {
    for (const cl of locs) {
      const pool = allContacts.filter((c) => c.sap_lead_location_id === cl.id);
      const sc = sapContactFromDbRows(pool);
      if (sc) {
        primaryEmployeeContact = sc;
        break;
      }
    }
  }
  if (!primaryEmployeeContact) primaryEmployeeContact = sapContactFromDbRows(allContacts);

  const bill = BPAddresses.find(
    (a) => a.AddressType === 'bo_BillTo' || (a.AddressType || '').toUpperCase() === 'B'
  );
  const ship = BPAddresses.find(
    (a) => a.AddressType === 'bo_ShipTo' || (a.AddressType || '').toUpperCase() === 'S'
  );
  const first = BPAddresses[0];

  return {
    CardCode: row.lead_code,
    CardName: row.lead_name,
    Phone1: row.phone_number || '',
    EmailAddress: row.email || '',
    BPAddresses,
    ...(primaryEmployeeContact ? { ContactEmployees: [primaryEmployeeContact] } : {}),
    BilltoDefault: bill?.AddressName || first?.AddressName || '',
    ShiptoDefault: ship?.AddressName || '',
    Street: flatAddr || first?.Street || '',
    Address: flatAddr || '',
    MailAddress: flatAddr || '',
    ZipCode: first?.ZipCode || '',
    City: first?.City || '',
    Country: 'SG',
    Building: first?.Building || '',
    BillToBuildingFloorRoom: first?.BuildingFloorRoom || '',
    CustomerType: 'SAP Lead (masterlist)',
  };
}

function normalizeLeadAddressType(raw) {
  const t = String(raw || '').trim().toUpperCase();
  if (t === 'B' || t === 'BO_BILLTO' || t === 'BILLTO') return 'bo_BillTo';
  if (t === 'S' || t === 'BO_SHIPTO' || t === 'SHIPTO') return 'bo_ShipTo';
  return t || '';
}

function leadLocationHasContent(cl) {
  if (!cl) return false;
  return Boolean(
    String(cl.street || '').trim() ||
      String(cl.building || '').trim() ||
      String(cl.address || '').trim() ||
      String(cl.site_id || '').trim()
  );
}

function leadLocationShortLabel(cl) {
  const site = String(cl.site_id || '').trim();
  if (site) return site;
  return String(cl.building || '').trim();
}

function resolveLeadLocationStreet(cl) {
  const street = String(cl.street || '').trim();
  if (street) return street;
  const address = String(cl.address || '').trim();
  if (address && address.includes(' ')) return address;
  return street || address || '';
}

function pickListPrimaryLeadLocation(locs) {
  const meaningful = (locs || []).filter(leadLocationHasContent);
  if (!meaningful.length) return null;
  const bill = meaningful.find((l) => normalizeLeadAddressType(l.address_type) === 'bo_BillTo');
  if (bill) return bill;
  const ship = meaningful.find((l) => normalizeLeadAddressType(l.address_type) === 'bo_ShipTo');
  if (ship) return ship;
  return meaningful[0];
}

function pickPrimaryContact(allContacts, firstLocId) {
  if (!Array.isArray(allContacts) || allContacts.length === 0) return null;
  if (firstLocId) {
    const atSite = allContacts.filter((c) => c.sap_lead_location_id === firstLocId);
    if (atSite.length) return atSite[0];
  }
  const generic = allContacts.filter((c) => !c.sap_lead_location_id);
  if (generic.length) return generic[0];
  return allContacts[0];
}

function contactDisplayName(c) {
  if (!c) return '';
  const raw = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ').trim();
  if (!raw || raw === '-' || raw === '—') return '';
  return raw;
}

/**
 * @param {object} row — PostgREST row for sap_lead with nested embeds
 * @returns {object} lead row for tanstack table / formatLeadAddress
 */
export function listRowFromSupabaseSapLead(row) {
  const locs = Array.isArray(row.sap_lead_location) ? row.sap_lead_location : [];
  const contacts = Array.isArray(row.sap_lead_contact) ? row.sap_lead_contact : [];
  const primaryLoc = pickListPrimaryLeadLocation(locs);
  const primary = pickPrimaryContact(contacts, primaryLoc?.id);
  const person = contactDisplayName(primary);
  const flatAddr = (row.lead_address || '').trim();

  const street = primaryLoc
    ? resolveLeadLocationStreet(primaryLoc)
    : flatAddr || '';
  const building = primaryLoc
    ? leadLocationShortLabel(primaryLoc) || String(primaryLoc.building || '').trim()
    : '';

  const addressLine = primaryLoc
    ? [street, building, primaryLoc.city, primaryLoc.zip_code, primaryLoc.country_name]
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .join(', ')
    : flatAddr;

  return {
    CardCode: row.lead_code || '',
    CardName: row.lead_name || '',
    Phone1: row.phone_number || primary?.tel1 || primary?.tel2 || '',
    Phone2: '',
    Cellular: '',
    EmailAddress: row.email || primary?.email || '',
    ContactPerson: person,
    Street: street,
    Building: building,
    BillToBuildingFloorRoom: building,
    Address: addressLine || flatAddr,
    MailAddress: flatAddr || addressLine || '',
    City: primaryLoc?.city || '',
    Country: displayCountryForLead(primaryLoc?.country_name),
    ZipCode: primaryLoc?.zip_code || '',
    locationCount: locs.filter(leadLocationHasContent).length,
    Notes: '',
    FreeText: '',
  };
}
