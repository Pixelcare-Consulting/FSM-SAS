/**
 * Convert-safe upsert of public.sap_lead (+ locations, optional contact) from SAP B1.
 * Does not touch portal customer rows — used by lead convert and shared with delta sync.
 */

import {
  fetchBpDetails,
  upsertSapLeadLocationsFromSap,
  pickPreferredSapAddressForJobs,
} from '../integrations/aifmSapMasterlistSync.js';
import { formatSapAddressLine } from '../integrations/sapAddressLocationHelpers.js';

function normalizeSapCardCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function portalLeadContactNames(lead) {
  const first = String(lead?.first_name || '').trim();
  const last = String(lead?.last_name || '').trim();
  if (first || last) {
    return { first_name: first || '—', middle_name: null, last_name: last || '—' };
  }
  const full = String(lead?.full_name || '').trim();
  if (!full) return { first_name: '—', middle_name: null, last_name: '—' };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], middle_name: null, last_name: '—' };
  return { first_name: parts[0], middle_name: null, last_name: parts.slice(1).join(' ') };
}

async function upsertSapLeadContactFromPortal(supabase, sapLeadId, portalLead) {
  if (!portalLead || !sapLeadId) return { skipped: true };

  const names = portalLeadContactNames(portalLead);
  const tel1 = String(portalLead.handphone || '').trim() || null;
  const email = String(portalLead.email || '').trim() || null;
  if (!tel1 && !email && names.first_name === '—' && names.last_name === '—') {
    return { skipped: true };
  }

  const payload = {
    sap_lead_id: sapLeadId,
    sap_lead_location_id: null,
    first_name: names.first_name,
    middle_name: names.middle_name,
    last_name: names.last_name,
    tel1,
    tel2: null,
    email,
  };

  let q = supabase
    .from('sap_lead_contact')
    .select('id')
    .eq('sap_lead_id', sapLeadId)
    .eq('first_name', names.first_name)
    .eq('last_name', names.last_name)
    .is('sap_lead_location_id', null);
  if (email) q = q.eq('email', email);
  else q = q.is('email', null);

  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr && findErr.code !== 'PGRST116') {
    throw new Error(`sap_lead_contact lookup: ${findErr.message}`);
  }

  if (existing?.id) {
    const { error: upErr } = await supabase.from('sap_lead_contact').update(payload).eq('id', existing.id);
    if (upErr) throw new Error(`sap_lead_contact update: ${upErr.message}`);
    return { updated: true };
  }

  const { error: insErr } = await supabase.from('sap_lead_contact').insert(payload);
  if (insErr) throw new Error(`sap_lead_contact insert: ${insErr.message}`);
  return { inserted: true };
}

/**
 * Upsert sap_lead masterlist row from live SAP BP (L*).
 * @param {{ supabase: object, sapCardCode: string, sessionCookies: object, portalLead?: object }} params
 */
export async function upsertSapLeadMasterlistFromSap({ supabase, sapCardCode, sessionCookies, portalLead = null }) {
  const lead_code = normalizeSapCardCode(sapCardCode);
  if (!lead_code.startsWith('L')) {
    throw new Error(`Expected SAP Lead CardCode (L*), got ${lead_code || '(empty)'}`);
  }
  if (!sessionCookies) {
    throw new Error(`SAP session unavailable — ${lead_code} not saved`);
  }
  if (!supabase) {
    throw new Error('Supabase client required for sap_lead masterlist upsert');
  }

  const details = await fetchBpDetails(lead_code, sessionCookies);
  if (!details?.cardCode) {
    throw new Error(`SAP Business Partner ${lead_code} not confirmed — not saved`);
  }

  const lead_name = details.cardName || details.cardCode;
  const phone_number = details.phone || null;
  const email = details.email || null;
  const lead_address =
    pickPreferredSapAddressForJobs(details.bpAddresses, {
      shipToDefault: details.shipToDefault,
      billToDefault: details.billToDefault,
    }) ||
    details.address ||
    (details.bpAddresses?.length ? formatSapAddressLine(details.bpAddresses[0]) : null);

  const { data: existing, error: selErr } = await supabase
    .from('sap_lead')
    .select('id, lead_code, lead_name')
    .eq('lead_code', details.cardCode)
    .is('deleted_at', null)
    .maybeSingle();
  if (selErr) throw new Error(`sap_lead select ${details.cardCode}: ${selErr.message}`);

  const row = {
    lead_code: details.cardCode,
    lead_name,
    phone_number,
    email,
    lead_address,
    updated_at: new Date().toISOString(),
  };

  let sapLeadId = existing?.id;
  let action = 'updated';

  if (existing?.id) {
    const { error: updErr } = await supabase.from('sap_lead').update(row).eq('id', existing.id);
    if (updErr) throw new Error(`sap_lead update ${details.cardCode}: ${updErr.message}`);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('sap_lead')
      .insert(row)
      .select('id, lead_code, lead_name')
      .single();
    if (insErr) throw new Error(`sap_lead insert ${details.cardCode}: ${insErr.message}`);
    sapLeadId = inserted.id;
    action = 'inserted';
  }

  const locationsSummary = details.bpAddresses?.length
    ? await upsertSapLeadLocationsFromSap(supabase, sapLeadId, details.bpAddresses)
    : { inserted: 0, updated: 0, removed: 0 };

  const contactSummary = portalLead
    ? await upsertSapLeadContactFromPortal(supabase, sapLeadId, portalLead)
    : { skipped: true };

  return {
    action,
    lead_code: details.cardCode,
    lead_name,
    id: sapLeadId,
    locations: locationsSummary,
    contact: contactSummary,
  };
}
