/**
 * SAP Service Layer customer data by CardCode (sql03 locations, sql08 equipment, sql10 service calls).
 * Uses browser SAP session cookies when present, otherwise env SAP login.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

import { getSupabaseAdmin } from '../supabase/server';
import {
  sapEquipmentFromDbRow,
  SUPABASE_CUSTOMER_WITH_LOCATIONS_SELECT,
} from './supabaseCustomerSapShim';
import {
  mapBpAddressToJobFormOption,
  mapCustomerBundleToJobFormLocations,
} from '../jobs/mapJobFormLocationOption.js';
import {
  sapPartnerFromSupabaseLeadBundle,
  SUPABASE_SAP_LEAD_MASTERLIST_SELECT,
} from '../leads/supabaseLeadSapShim';
import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../services/sapService';

function isSapNoRecordsResponse(status, responseText) {
  if (status !== 404) return false;
  return /No matching records found|-2028/i.test(String(responseText || ''));
}

function pickSapField(row, ...keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    const val = row[key];
    if (val != null && String(val).trim() !== '') return val;
  }
  return '';
}

export async function resolveSapSessionCookies(req) {
  if (req?.cookies) {
    const b1session = req.cookies.B1SESSION;
    const routeid = req.cookies.ROUTEID;
    const sessionExpiry = req.cookies.B1SESSION_EXPIRY;
    if (b1session && routeid) {
      if (!sessionExpiry || Date.now() < new Date(sessionExpiry).getTime()) {
        return { b1session, routeid };
      }
    }
  }

  const sapLogin = await loginSessionCookiesFromEnvironment();
  return unwrapSapEnvironmentLogin(sapLogin);
}

async function runSapSqlQuery(queryId, cardCode, sessionCookies) {
  const code = String(cardCode || '').trim().replace(/'/g, "''");
  if (!code) return [];

  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  if (!SAP_SERVICE_LAYER_BASE_URL) return [];
  if (!sessionCookies?.b1session || !sessionCookies?.routeid) return [];

  const queryResponse = await fetch(
    `${SAP_SERVICE_LAYER_BASE_URL}SQLQueries('${queryId}')/List`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `B1SESSION=${sessionCookies.b1session}; ROUTEID=${sessionCookies.routeid}`,
      },
      body: JSON.stringify({ ParamList: `CardCode='${code}'` }),
    }
  );

  const responseText = await queryResponse.text();
  if (!queryResponse.ok) {
    if (isSapNoRecordsResponse(queryResponse.status, responseText)) {
      return [];
    }
    const err = new Error(responseText || `SAP ${queryId} query failed (${queryResponse.status})`);
    err.status = queryResponse.status;
    throw err;
  }

  const queryData = JSON.parse(responseText);
  return Array.isArray(queryData?.value) ? queryData.value : [];
}

function mapSapLocationRow(item) {
  return mapBpAddressToJobFormOption({
    SiteID: pickSapField(item, 'SiteID', 'AddressName'),
    AddressName: pickSapField(item, 'SiteID', 'AddressName'),
    Building: pickSapField(item, 'Building', 'BuildingFloorRoom'),
    BuildingFloorRoom: pickSapField(item, 'Building', 'BuildingFloorRoom'),
    StreetNo: pickSapField(item, 'StreetNo'),
    Street: pickSapField(item, 'Street'),
    Block: pickSapField(item, 'Block'),
    Address: pickSapField(item, 'Address', 'Street'),
    City: pickSapField(item, 'City'),
    CountryName: pickSapField(item, 'CountryName', 'Country'),
    Country: pickSapField(item, 'CountryName', 'Country'),
    ZipCode: pickSapField(item, 'ZipCode'),
    AddressType: pickSapField(item, 'AdresType', 'AddressType'),
  });
}

function mapMasterlistBpAddressToLocation(addr) {
  return mapBpAddressToJobFormOption(addr);
}

function mapSapServiceCallRow(item) {
  const rawId = pickSapField(item, 'ServiceCallID', "'ServiceCallID'", 'CallID');
  const parsedId = parseInt(String(rawId).replace(/'/g, ''), 10);
  return {
    serviceCallID: Number.isFinite(parsedId) ? parsedId : rawId,
    subject: pickSapField(item, 'Subject', "'Subject'"),
    customerName: pickSapField(item, 'CustomerName', "'CustomerName'"),
    createDate: pickSapField(item, 'CreateDate', "'CreateDate'"),
    createTime: pickSapField(item, 'CreateTime', "'CreateTime'"),
    description: pickSapField(item, 'Description', "'Description'"),
  };
}

export async function fetchSapLocationsByCardCode(cardCode, sessionCookies) {
  const rows = await runSapSqlQuery('sql03', cardCode, sessionCookies);
  return rows
    .map(mapSapLocationRow)
    .filter((loc) => loc && (loc.siteId || loc.address));
}

export async function fetchSapEquipmentsByCardCode(cardCode, sessionCookies) {
  const rows = await runSapSqlQuery('sql08', cardCode, sessionCookies);
  return rows.map((item) => ({ ...item }));
}

export async function fetchSapServiceCallsByCardCode(cardCode, sessionCookies) {
  const rows = await runSapSqlQuery('sql10', cardCode, sessionCookies);
  return rows.map(mapSapServiceCallRow).filter((row) => row.serviceCallID != null && row.serviceCallID !== '');
}

async function fetchMasterlistLocationsByCardCode(cardCode) {
  const code = String(cardCode || '').trim();
  if (!code) return [];

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from('customer')
    .select(SUPABASE_CUSTOMER_WITH_LOCATIONS_SELECT)
    .eq('customer_code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!row) return [];

  return mapCustomerBundleToJobFormLocations(row);
}

async function fetchMasterlistLeadLocationsByCardCode(cardCode) {
  const code = String(cardCode || '').trim().toUpperCase();
  if (!code.startsWith('L')) return [];

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from('sap_lead')
    .select(SUPABASE_SAP_LEAD_MASTERLIST_SELECT)
    .eq('lead_code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!row) return [];

  const partner = sapPartnerFromSupabaseLeadBundle(row);
  const addrs = Array.isArray(partner?.BPAddresses) ? partner.BPAddresses : [];
  return addrs.map(mapMasterlistBpAddressToLocation).filter((loc) => loc.siteId || loc.address);
}

async function fetchSupabaseEquipmentsByCardCode(cardCode) {
  const code = String(cardCode || '').trim();
  if (!code) return [];

  const supabase = getSupabaseAdmin();
  const { data: customer, error: cErr } = await supabase
    .from('customer')
    .select('id')
    .eq('customer_code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (cErr) throw cErr;
  if (!customer?.id) return [];

  const { data: rows, error: eqErr } = await supabase
    .from('equipments')
    .select('*')
    .eq('customer_id', customer.id)
    .is('deleted_at', null)
    .order('item_code', { ascending: true });

  if (eqErr) throw eqErr;
  return (rows || []).map(sapEquipmentFromDbRow).filter(Boolean);
}

export async function fetchLocationsByCardCode(cardCode, { req } = {}) {
  const code = String(cardCode || '').trim();
  if (!code) return { source: null, locations: [] };

  try {
    const fromMasterlist = await fetchMasterlistLocationsByCardCode(code);
    if (fromMasterlist.length > 0) {
      return { source: 'masterlist', locations: fromMasterlist };
    }
  } catch (masterlistErr) {
    console.warn('fetchLocationsByCardCode masterlist:', masterlistErr?.message || masterlistErr);
  }

  try {
    const fromLeadMasterlist = await fetchMasterlistLeadLocationsByCardCode(code);
    if (fromLeadMasterlist.length > 0) {
      return { source: 'sap_lead_masterlist', locations: fromLeadMasterlist };
    }
  } catch (leadMasterlistErr) {
    console.warn(
      'fetchLocationsByCardCode sap_lead masterlist:',
      leadMasterlistErr?.message || leadMasterlistErr
    );
  }

  const sessionCookies = await resolveSapSessionCookies(req);
  if (sessionCookies?.b1session && sessionCookies?.routeid) {
    try {
      const fromSap = await fetchSapLocationsByCardCode(code, sessionCookies);
      if (fromSap.length > 0) {
        return { source: 'sap', locations: fromSap };
      }
    } catch (sapErr) {
      console.warn('fetchLocationsByCardCode SAP:', sapErr?.message || sapErr);
    }
  }

  return { source: null, locations: [] };
}

export async function fetchServiceCallsByCardCode(cardCode, { req } = {}) {
  const code = String(cardCode || '').trim();
  if (!code) return { source: null, serviceCalls: [] };

  const sessionCookies = await resolveSapSessionCookies(req);
  if (!sessionCookies?.b1session || !sessionCookies?.routeid) {
    return { source: null, serviceCalls: [] };
  }

  try {
    const serviceCalls = await fetchSapServiceCallsByCardCode(code, sessionCookies);
    return {
      source: serviceCalls.length > 0 ? 'sap' : null,
      serviceCalls,
    };
  } catch (sapErr) {
    console.warn('fetchServiceCallsByCardCode SAP:', sapErr?.message || sapErr);
    throw sapErr;
  }
}

export async function fetchEquipmentsByCardCode(cardCode, { req } = {}) {
  const code = String(cardCode || '').trim();
  if (!code) return { source: null, equipments: [] };

  const sessionCookies = await resolveSapSessionCookies(req);
  if (sessionCookies?.b1session && sessionCookies?.routeid) {
    try {
      const fromSap = await fetchSapEquipmentsByCardCode(code, sessionCookies);
      if (fromSap.length > 0) {
        return { source: 'sap', equipments: fromSap };
      }
    } catch (sapErr) {
      console.warn('fetchEquipmentsByCardCode SAP:', sapErr?.message || sapErr);
    }
  }

  const fromDb = await fetchSupabaseEquipmentsByCardCode(code);
  return {
    source: fromDb.length > 0 ? 'supabase' : null,
    equipments: fromDb,
  };
}
