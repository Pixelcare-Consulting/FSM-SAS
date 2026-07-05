/**
 * Mirror Supabase masterlist contact data into public.contacts for portal jobs.
 * Job detail reads contacts by customer_id (+ customer_location_id via pickMasterlistSiteContact).
 */

import { formatAifmPersonNameLastFirst } from '../utils/aifmJobCustomerName.js';
const stripPlaceholder = (s) => {
  const t = String(s || '').trim();
  if (!t || t === '-' || t === '—') return '';
  return t;
};

function parseDisplayNameToParts(fullName) {
  const full = stripPlaceholder(fullName);
  if (!full) return { first_name: '-', middle_name: null, last_name: '-' };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { first_name: parts[0], middle_name: null, last_name: parts.slice(1).join(' ') };
  }
  return { first_name: parts[0], middle_name: null, last_name: '-' };
}

async function findExistingPortalContact(supabase, customerId, customerLocationId, payload) {
  let q = supabase
    .from('contacts')
    .select('id')
    .eq('customer_id', customerId)
    .eq('first_name', payload.first_name)
    .eq('last_name', payload.last_name);

  if (customerLocationId) q = q.eq('customer_location_id', customerLocationId);
  else q = q.is('customer_location_id', null);

  if (payload.email) q = q.eq('email', payload.email);
  else q = q.is('email', null);

  const { data, error } = await q.maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.id ?? null;
}

function contactRowDisplayName(row) {
  const fn = stripPlaceholder(row?.first_name);
  const ln = stripPlaceholder(row?.last_name);
  if (ln && ln !== '-') return `${fn} ${ln}`.replace(/\s+/g, ' ').trim();
  return fn;
}

async function upsertLeadPrimaryFromSapLead(supabase, customerId, customerLocationId, lead) {
  const names = parseDisplayNameToParts(lead.lead_name);
  const payload = {
    customer_id: customerId,
    customer_location_id: customerLocationId || null,
    ...names,
    tel1: lead.phone_number || null,
    tel2: null,
    email: lead.email || null,
  };

  const leadName = stripPlaceholder(lead.lead_name).toLowerCase();
  const { data: rows, error } = await supabase.from('contacts').select('*').eq('customer_id', customerId);
  if (error) throw error;

  const match =
    (rows || []).find((r) => contactRowDisplayName(r).toLowerCase() === leadName) ||
    (rows || []).find((r) => stripPlaceholder(r.first_name).toLowerCase() === leadName) ||
    (rows || []).find((r) => !r.tel1 && !r.tel2 && (lead.phone_number || lead.email));

  if (match?.id) {
    const { error: upErr } = await supabase.from('contacts').update(payload).eq('id', match.id);
    if (upErr) throw upErr;

    const canonical = contactRowDisplayName(payload).toLowerCase();
    const dupIds = (rows || [])
      .filter((r) => {
        if (r.id === match.id) return false;
        const sameName = contactRowDisplayName(r).toLowerCase() === canonical;
        const empty = !r.tel1 && !r.tel2 && !r.email;
        return sameName && empty;
      })
      .map((r) => r.id);
    if (dupIds.length) {
      await supabase.from('contacts').delete().in('id', dupIds);
    }

    return { action: 'updated' };
  }

  return upsertPortalContactRow(supabase, customerId, customerLocationId, payload);
}

async function upsertPortalContactRow(supabase, customerId, customerLocationId, fields) {
  const payload = {
    customer_id: customerId,
    customer_location_id: customerLocationId || null,
    first_name: fields.first_name || '-',
    middle_name: fields.middle_name || null,
    last_name: fields.last_name || '-',
    tel1: fields.tel1 || null,
    tel2: fields.tel2 || null,
    email: fields.email || null,
  };

  const hasSignal =
    stripPlaceholder(payload.first_name) ||
    stripPlaceholder(payload.last_name) ||
    payload.tel1 ||
    payload.tel2 ||
    payload.email;
  if (!hasSignal) return { action: 'skipped' };

  const existingId = await findExistingPortalContact(supabase, customerId, customerLocationId, payload);
  if (existingId) {
    const { error } = await supabase.from('contacts').update(payload).eq('id', existingId);
    if (error) throw error;
    return { action: 'updated' };
  }

  const { error: insErr } = await supabase.from('contacts').insert(payload);
  if (insErr && /customer_location_id/i.test(insErr.message || '')) {
    const fallback = { ...payload };
    delete fallback.customer_location_id;
    const { error: e2 } = await supabase.from('contacts').insert(fallback);
    if (e2) throw e2;
    return { action: 'inserted', warning: 'customer_location_id column missing' };
  }
  if (insErr) throw insErr;
  return { action: 'inserted' };
}

function buildCustomerLocationIndex(customerLocations) {
  const bySiteId = new Map();
  for (const cl of customerLocations || []) {
    const sid = stripPlaceholder(cl.site_id);
    if (sid) bySiteId.set(sid.toLowerCase(), cl);
  }
  return bySiteId;
}

function resolveCustomerLocationId({ customerLocations, locationId, locationName }) {
  if (!customerLocations?.length) return null;

  if (locationId) {
    const hit = customerLocations.find((cl) => cl.location_id === locationId);
    if (hit?.id) return hit.id;
  }

  if (locationName) {
    const locName = String(locationName).trim().toLowerCase();
    const fuzzy = customerLocations.find((cl) => {
      const sid = String(cl.site_id || '').trim().toLowerCase();
      const bld = String(cl.building || '').trim().toLowerCase();
      return (sid && locName.includes(sid)) || (bld && locName.includes(bld));
    });
    if (fuzzy?.id) return fuzzy.id;
  }

  return customerLocations[0]?.id ?? null;
}

async function syncSapLeadContactsToPortal(supabase, customerRow, { locationId, locationName } = {}) {
  const code = String(customerRow?.customer_code || '').trim();
  if (!code.toUpperCase().startsWith('L')) return { inserted: 0, updated: 0, skipped: 0 };

  const { data: lead, error: leadErr } = await supabase
    .from('sap_lead')
    .select('id, lead_code, lead_name, phone_number, email')
    .eq('lead_code', code)
    .is('deleted_at', null)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead?.id) return { inserted: 0, updated: 0, skipped: 0, reason: 'no_sap_lead' };

  const [{ data: sapContacts }, { data: sapLocations }, { data: customerLocations }] =
    await Promise.all([
      supabase.from('sap_lead_contact').select('*').eq('sap_lead_id', lead.id),
      supabase.from('sap_lead_location').select('id, site_id, location_id').eq('sap_lead_id', lead.id),
      supabase
        .from('customer_location')
        .select('id, site_id, building, location_id')
        .eq('customer_id', customerRow.id),
    ]);

  const clBySite = buildCustomerLocationIndex(customerLocations);
  const sapLocById = new Map((sapLocations || []).map((l) => [l.id, l]));
  const preferredClId = resolveCustomerLocationId({
    customerLocations,
    locationId,
    locationName,
  });

  const stats = { inserted: 0, updated: 0, skipped: 0 };

  for (const sc of sapContacts || []) {
    let customerLocationId = null;
    if (sc.sap_lead_location_id) {
      const sapLoc = sapLocById.get(sc.sap_lead_location_id);
      const siteKey = stripPlaceholder(sapLoc?.site_id).toLowerCase();
      customerLocationId = siteKey ? clBySite.get(siteKey)?.id ?? null : null;
    }
    if (!customerLocationId && preferredClId) {
      customerLocationId = preferredClId;
    }

    const r = await upsertPortalContactRow(supabase, customerRow.id, customerLocationId, {
      first_name: sc.first_name,
      middle_name: sc.middle_name,
      last_name: sc.last_name,
      tel1: sc.tel1,
      tel2: sc.tel2,
      email: sc.email,
    });
    if (r.action === 'inserted') stats.inserted++;
    else if (r.action === 'updated') stats.updated++;
    else stats.skipped++;
  }

  if (lead.phone_number || lead.email || lead.lead_name) {
    const r = await upsertLeadPrimaryFromSapLead(
      supabase,
      customerRow.id,
      preferredClId,
      lead
    );
    if (r.action === 'inserted') stats.inserted++;
    else if (r.action === 'updated') stats.updated++;
  }

  return stats;
}

/**
 * Optional AIFM job row site contact (not the account name).
 */
export async function upsertAifmSiteContactForJob(
  supabase,
  customerId,
  customerLocationId,
  aifmJob,
  { accountName = '' } = {}
) {
  if (!supabase || !customerId || !aifmJob) return { action: 'skipped' };

  const displayName = formatAifmPersonNameLastFirst(
    aifmJob.customer_firstName,
    aifmJob.customer_lastName
  );
  const phone = stripPlaceholder(aifmJob.customer_phone || aifmJob.customerPhone);
  const email = stripPlaceholder(aifmJob.customer_email || aifmJob.customerEmail);

  if (!displayName && !phone && !email) return { action: 'skipped' };

  const acct = stripPlaceholder(accountName).toLowerCase();
  if (acct && displayName && displayName.toLowerCase() === acct) {
    return { action: 'skipped' };
  }

  const names = parseDisplayNameToParts(displayName);
  return upsertPortalContactRow(supabase, customerId, customerLocationId, {
    ...names,
    tel1: phone || null,
    tel2: null,
    email: email || null,
  });
}

async function dedupeCustomerContacts(supabase, customerId) {
  const { data: rows, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, tel1, tel2, email, customer_location_id')
    .eq('customer_id', customerId);
  if (error || !rows?.length) return 0;

  const keep = new Map();
  const remove = [];
  for (const row of rows) {
    const key = [
      row.customer_location_id || '',
      contactRowDisplayName(row).toLowerCase(),
      row.tel1 || '',
      row.tel2 || '',
      row.email || '',
    ].join('|');
    if (keep.has(key)) remove.push(row.id);
    else keep.set(key, row.id);
  }
  if (!remove.length) return 0;
  const { error: delErr } = await supabase.from('contacts').delete().in('id', remove);
  if (delErr) throw delErr;
  return remove.length;
}

/**
 * @returns {{ inserted: number, updated: number, skipped: number, hadContacts: boolean, deduped: number }}
 */
export async function syncPortalContactsFromMasterlist(
  supabase,
  { customerId, locationId = null, locationName = null, aifmJob = null } = {}
) {
  if (!supabase || !customerId) {
    return { inserted: 0, updated: 0, skipped: 0, hadContacts: false };
  }

  const { data: customer, error: custErr } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name, phone_number, email')
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (custErr) throw custErr;
  if (!customer?.id) {
    return { inserted: 0, updated: 0, skipped: 0, hadContacts: false };
  }

  const { count: beforeCount } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId);

  const code = String(customer.customer_code || '').trim().toUpperCase();
  let stats = { inserted: 0, updated: 0, skipped: 0 };

  if (code.startsWith('L')) {
    stats = await syncSapLeadContactsToPortal(supabase, customer, { locationId, locationName });
  }

  const { data: customerLocations } = await supabase
    .from('customer_location')
    .select('id, site_id, building, location_id')
    .eq('customer_id', customerId);

  const preferredClId = resolveCustomerLocationId({
    customerLocations,
    locationId,
    locationName,
  });

  if (aifmJob) {
    const site = await upsertAifmSiteContactForJob(
      supabase,
      customerId,
      preferredClId,
      aifmJob,
      { accountName: customer.customer_name }
    );
    if (site.action === 'inserted') stats.inserted++;
    else if (site.action === 'updated') stats.updated++;
  }

  const { count: afterLeadSync } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId);

  if (!afterLeadSync && (customer.phone_number || customer.email)) {
    const names = parseDisplayNameToParts(customer.customer_name);
    const r = await upsertPortalContactRow(supabase, customer.id, preferredClId, {
      ...names,
      tel1: customer.phone_number || null,
      tel2: null,
      email: customer.email || null,
    });
    if (r.action === 'inserted') stats.inserted++;
    else if (r.action === 'updated') stats.updated++;
  }

  const deduped = await dedupeCustomerContacts(supabase, customerId);
  const hadContacts = Boolean(beforeCount);
  return { ...stats, hadContacts, deduped };
}
