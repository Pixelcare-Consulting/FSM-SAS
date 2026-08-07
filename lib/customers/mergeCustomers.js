/**
 * Admin customer merge: discover L/CP/C duplicates and consolidate onto one survivor UUID.
 */

import {
  normalizeContactEmail,
  normalizeContactPhoneDigits,
  phonesMatchLast8,
} from './portalDuplicateCheck.js';
import {
  isOfficialSapCustomerCode,
  isPortalCustomerCode,
  isSyncedPortalCpRow,
  normalizePromotionCode,
} from './promotePortalCustomerCodes.js';
import { normalizeNameForMatch } from '../integrations/aifmAssignCustomersCore.js';
import { promotePortalCustomerFromSap } from './promotePortalCustomerFromSap.js';

const CUSTOMER_FK_TABLES = [
  { table: 'jobs', softDelete: true },
  { table: 'contacts', softDelete: false },
  { table: 'customer_location', softDelete: false },
  { table: 'equipments', softDelete: true },
  { table: 'customer_notes', softDelete: true },
  { table: 'service_call', softDelete: true },
  { table: 'leads', softDelete: true },
  { table: 'locations', softDelete: true },
];

export function getAccountType(code) {
  const normalized = normalizePromotionCode(code);
  if (!normalized) return 'OTHER';
  if (isPortalCustomerCode(normalized)) return 'CP';
  if (/^L/i.test(normalized)) return 'L';
  if (isOfficialSapCustomerCode(normalized)) return 'C';
  return 'OTHER';
}

function namesMatch(a, b) {
  const na = normalizeNameForMatch(a).toLowerCase();
  const nb = normalizeNameForMatch(b).toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

function matchReasonsForRow(seed, row) {
  const reasons = [];
  const seedEmail = normalizeContactEmail(seed.email);
  const rowEmail = normalizeContactEmail(row.email);
  if (seedEmail && rowEmail && seedEmail === rowEmail) reasons.push('email');

  const seedPhone = normalizeContactPhoneDigits(seed.phone_number || seed.phone);
  const rowPhone = normalizeContactPhoneDigits(row.phone_number || row.phone);
  if (seedPhone && rowPhone && phonesMatchLast8(seedPhone, rowPhone)) reasons.push('phone');

  if (namesMatch(seed.customer_name || seed.name, row.customer_name || row.name || row.lead_name)) {
    reasons.push('name');
  }
  return reasons;
}

async function countJobsForCustomer(supabase, customerId) {
  const { count, error } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .is('deleted_at', null);
  if (error) throw new Error(`Job count failed: ${error.message}`);
  return count || 0;
}

async function loadCustomerByIdOrCode(supabase, { customerId, customerCode }) {
  if (customerId) {
    const { data, error } = await supabase
      .from('customer')
      .select(
        'id, customer_code, customer_name, email, phone_number, sap_card_code, synced_to_sap_at, source'
      )
      .eq('id', customerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Customer lookup failed: ${error.message}`);
    return data;
  }

  const code = normalizePromotionCode(customerCode);
  if (!code) return null;

  const { data, error } = await supabase
    .from('customer')
    .select(
      'id, customer_code, customer_name, email, phone_number, sap_card_code, synced_to_sap_at, source'
    )
    .eq('customer_code', code)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`Customer lookup failed: ${error.message}`);
  if (data) return data;

  // Seed may be an L* sap_lead with no customer row yet.
  return null;
}

async function loadSapLeadByCode(supabase, code) {
  const leadCode = normalizePromotionCode(code);
  if (!leadCode || !/^L/i.test(leadCode)) return null;
  const { data, error } = await supabase
    .from('sap_lead')
    .select('id, lead_code, lead_name, email, phone_number')
    .eq('lead_code', leadCode)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`SAP lead lookup failed: ${error.message}`);
  return data;
}

function escapeIlike(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Find duplicate candidates for a seed customer (or lead code).
 * @returns {Promise<{ seed: object, candidates: object[], recommendedSurvivorId: string|null }>}
 */
export async function findCustomerDuplicates(supabase, { customerId, customerCode } = {}) {
  let seed = await loadCustomerByIdOrCode(supabase, { customerId, customerCode });
  let seedLead = null;

  if (!seed && customerCode) {
    seedLead = await loadSapLeadByCode(supabase, customerCode);
    if (seedLead) {
      seed = {
        id: null,
        customer_code: seedLead.lead_code,
        customer_name: seedLead.lead_name,
        email: seedLead.email,
        phone_number: seedLead.phone_number,
        sap_card_code: null,
        synced_to_sap_at: null,
        source: null,
        entityType: 'sap_lead',
        sapLeadId: seedLead.id,
      };
    }
  }

  if (!seed) {
    return { seed: null, candidates: [], recommendedSurvivorId: null };
  }

  const emailNorm = normalizeContactEmail(seed.email);
  const phoneDigits = normalizeContactPhoneDigits(seed.phone_number);
  const phoneLast8 = phoneDigits.length >= 8 ? phoneDigits.slice(-8) : phoneDigits;
  const nameNorm = normalizeNameForMatch(seed.customer_name);
  const byId = new Map();

  if (seed.id) {
    byId.set(seed.id, { ...seed, entityType: 'customer', matchReasons: [] });
  }

  const orParts = [];
  if (emailNorm) orParts.push(`email.eq.${emailNorm}`);
  if (phoneLast8) orParts.push(`phone_number.ilike.%${escapeIlike(phoneLast8)}%`);
  if (nameNorm && nameNorm.length >= 3) {
    orParts.push(`customer_name.ilike.%${escapeIlike(nameNorm)}%`);
  }

  if (orParts.length > 0) {
    const { data: rows, error } = await supabase
      .from('customer')
      .select(
        'id, customer_code, customer_name, email, phone_number, sap_card_code, synced_to_sap_at, source'
      )
      .is('deleted_at', null)
      .or(orParts.join(','))
      .limit(80);
    if (error) throw new Error(`Duplicate customer search failed: ${error.message}`);
    for (const row of rows || []) {
      const reasons = matchReasonsForRow(seed, row);
      if (reasons.length === 0 && row.id !== seed.id) continue;
      const existing = byId.get(row.id);
      byId.set(row.id, {
        ...row,
        entityType: 'customer',
        matchReasons: existing?.matchReasons?.length
          ? [...new Set([...(existing.matchReasons || []), ...reasons])]
          : reasons,
      });
    }
  }

  const leadOrParts = [];
  if (emailNorm) leadOrParts.push(`email.eq.${emailNorm}`);
  if (phoneLast8) leadOrParts.push(`phone_number.ilike.%${escapeIlike(phoneLast8)}%`);
  if (nameNorm && nameNorm.length >= 3) {
    leadOrParts.push(`lead_name.ilike.%${escapeIlike(nameNorm)}%`);
  }

  const sapLeadById = new Map();
  if (seedLead?.id) {
    sapLeadById.set(seedLead.id, {
      id: seedLead.id,
      customer_code: seedLead.lead_code,
      customer_name: seedLead.lead_name,
      email: seedLead.email,
      phone_number: seedLead.phone_number,
      entityType: 'sap_lead',
      matchReasons: [],
      jobCount: 0,
      accountType: 'L',
    });
  }

  if (leadOrParts.length > 0) {
    const { data: leadRows, error: leadErr } = await supabase
      .from('sap_lead')
      .select('id, lead_code, lead_name, email, phone_number')
      .is('deleted_at', null)
      .or(leadOrParts.join(','))
      .limit(80);
    if (leadErr) throw new Error(`Duplicate sap_lead search failed: ${leadErr.message}`);
    for (const lead of leadRows || []) {
      const shaped = {
        id: lead.id,
        customer_code: lead.lead_code,
        customer_name: lead.lead_name,
        email: lead.email,
        phone_number: lead.phone_number,
      };
      const reasons = matchReasonsForRow(seed, shaped);
      if (reasons.length === 0 && lead.id !== seedLead?.id) continue;
      const existing = sapLeadById.get(lead.id);
      sapLeadById.set(lead.id, {
        ...shaped,
        entityType: 'sap_lead',
        matchReasons: existing?.matchReasons?.length
          ? [...new Set([...(existing.matchReasons || []), ...reasons])]
          : reasons,
        jobCount: 0,
        accountType: 'L',
      });
    }
  }

  // Also pull sap_lead rows that share codes already found on customer candidates (L*).
  for (const row of byId.values()) {
    if (getAccountType(row.customer_code) !== 'L') continue;
    const lead = await loadSapLeadByCode(supabase, row.customer_code);
    if (!lead || sapLeadById.has(lead.id)) continue;
    sapLeadById.set(lead.id, {
      id: lead.id,
      customer_code: lead.lead_code,
      customer_name: lead.lead_name,
      email: lead.email,
      phone_number: lead.phone_number,
      entityType: 'sap_lead',
      matchReasons: ['code'],
      jobCount: 0,
      accountType: 'L',
    });
  }

  const customers = [];
  for (const row of byId.values()) {
    const jobCount = await countJobsForCustomer(supabase, row.id);
    customers.push({
      id: row.id,
      entityType: 'customer',
      code: row.customer_code,
      name: row.customer_name,
      email: row.email || null,
      phone: row.phone_number || null,
      sapCardCode: row.sap_card_code || null,
      syncedToSapAt: row.synced_to_sap_at || null,
      source: row.source || null,
      accountType: getAccountType(row.customer_code),
      jobCount,
      matchReasons: row.matchReasons || [],
      isSeed: row.id === seed.id,
    });
  }

  const leads = [...sapLeadById.values()].map((lead) => ({
    id: lead.id,
    entityType: 'sap_lead',
    code: lead.customer_code,
    name: lead.customer_name,
    email: lead.email || null,
    phone: lead.phone_number || null,
    sapCardCode: null,
    syncedToSapAt: null,
    source: null,
    accountType: 'L',
    jobCount: 0,
    matchReasons: lead.matchReasons || [],
    isSeed: lead.id === seedLead?.id,
  }));

  // Drop sap_lead entries that only mirror a customer row with the same L code (keep both:
  // customer for jobs, sap_lead for picker cleanup) — UI shows both with entityType.
  const candidates = [...customers, ...leads].sort((a, b) => {
    const typeRank = { C: 0, CP: 1, L: 2, OTHER: 3 };
    const tr = (typeRank[a.accountType] ?? 9) - (typeRank[b.accountType] ?? 9);
    if (tr !== 0) return tr;
    return (b.jobCount || 0) - (a.jobCount || 0);
  });

  const recommendedSurvivorId = pickRecommendedSurvivorId(customers);

  return {
    seed: {
      id: seed.id,
      code: seed.customer_code,
      name: seed.customer_name,
      email: seed.email || null,
      phone: seed.phone_number || null,
      entityType: seed.entityType || 'customer',
      sapLeadId: seed.sapLeadId || null,
    },
    candidates,
    recommendedSurvivorId,
  };
}

/**
 * Survivor preference: official C* > most jobs > CP over lead-only.
 */
export function pickRecommendedSurvivorId(customerCandidates) {
  const customers = (customerCandidates || []).filter((c) => c.entityType === 'customer' || c.id);
  if (customers.length === 0) return null;

  const officialC = customers.filter((c) =>
    isOfficialSapCustomerCode(c.code || c.customer_code)
  );
  const pool = officialC.length > 0 ? officialC : customers;

  const sorted = [...pool].sort((a, b) => {
    const jobDiff = (b.jobCount || 0) - (a.jobCount || 0);
    if (jobDiff !== 0) return jobDiff;
    const aCp = isPortalCustomerCode(a.code || a.customer_code) ? 1 : 0;
    const bCp = isPortalCustomerCode(b.code || b.customer_code) ? 1 : 0;
    return bCp - aCp;
  });

  return sorted[0]?.id || null;
}

function detectPromotionPair(customerRows) {
  const syncedCp = customerRows.filter((r) => isSyncedPortalCpRow(r));
  const officialC = customerRows.filter((r) => isOfficialSapCustomerCode(r.customer_code));
  if (syncedCp.length !== 1 || officialC.length !== 1) return null;
  return { cp: syncedCp[0], c: officialC[0] };
}

async function reassignCustomerFks(supabase, loserId, survivorId) {
  const counts = {};
  for (const { table } of CUSTOMER_FK_TABLES) {
    let query = supabase
      .from(table)
      .update({ customer_id: survivorId })
      .eq('customer_id', loserId);
    // Prefer not moving already-deleted rows when the column exists.
    if (['jobs', 'equipments', 'customer_notes', 'service_call', 'leads', 'locations'].includes(table)) {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query.select('id');
    if (error) throw new Error(`Failed to reassign ${table}: ${error.message}`);
    counts[table] = (data || []).length;
  }
  return counts;
}

async function rewriteAddressDetailsCode(supabase, loserCode, survivorCode) {
  const now = new Date().toISOString();
  const loser = normalizePromotionCode(loserCode);
  const survivor = normalizePromotionCode(survivorCode);
  if (!loser || !survivor || loser === survivor) {
    return { moved: 0, softDeletedDuplicates: 0 };
  }

  const { data: loserRows, error } = await supabase
    .from('customer_address_details')
    .select('id, address_name')
    .eq('customer_code', loser)
    .is('deleted_at', null);
  if (error) throw new Error(`Address details lookup failed: ${error.message}`);

  const { data: survivorRows, error: sErr } = await supabase
    .from('customer_address_details')
    .select('id, address_name')
    .eq('customer_code', survivor)
    .is('deleted_at', null);
  if (sErr) throw new Error(`Survivor address details lookup failed: ${sErr.message}`);

  const survivorNames = new Set(
    (survivorRows || []).map((r) => String(r.address_name || '').trim().toLowerCase())
  );

  let moved = 0;
  let softDeletedDuplicates = 0;
  for (const row of loserRows || []) {
    const key = String(row.address_name || '').trim().toLowerCase();
    if (key && survivorNames.has(key)) {
      const { error: delErr } = await supabase
        .from('customer_address_details')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', row.id);
      if (delErr) throw new Error(`Address details soft-delete failed: ${delErr.message}`);
      softDeletedDuplicates += 1;
      continue;
    }
    const { error: updErr } = await supabase
      .from('customer_address_details')
      .update({ customer_code: survivor, updated_at: now })
      .eq('id', row.id);
    if (updErr) throw new Error(`Address details rewrite failed: ${updErr.message}`);
    moved += 1;
    if (key) survivorNames.add(key);
  }

  return { moved, softDeletedDuplicates };
}

async function softDeleteSapLead(supabase, sapLeadId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('sap_lead')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', sapLeadId)
    .is('deleted_at', null);
  if (error) throw new Error(`SAP lead soft-delete failed: ${error.message}`);
}

async function vacateCustomerCode(supabase, customerId, code) {
  const vacated = `${normalizePromotionCode(code)}__MERGED_${String(customerId).slice(0, 8)}`;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('customer')
    .update({ customer_code: vacated, deleted_at: now, updated_at: now })
    .eq('id', customerId);
  if (error) throw new Error(`Failed to vacate customer code: ${error.message}`);
  return vacated;
}

/**
 * Merge loser customer / sap_lead records onto survivor customer UUID.
 */
export async function mergeCustomers(supabase, {
  survivorId,
  loserCustomerIds = [],
  loserSapLeadIds = [],
  sessionCookies = null,
  confirm = false,
} = {}) {
  if (!confirm) {
    throw new Error('Merge requires confirm: true');
  }
  if (!survivorId) {
    throw new Error('survivorId is required');
  }

  const loserCustIds = [...new Set((loserCustomerIds || []).filter(Boolean))].filter(
    (id) => id !== survivorId
  );
  const loserLeadIds = [...new Set((loserSapLeadIds || []).filter(Boolean))];

  if (loserCustIds.length === 0 && loserLeadIds.length === 0) {
    throw new Error('At least one loser id is required');
  }

  const allCustomerIds = [survivorId, ...loserCustIds];
  const { data: customerRows, error: custErr } = await supabase
    .from('customer')
    .select(
      'id, customer_code, customer_name, email, phone_number, sap_card_code, synced_to_sap_at, source'
    )
    .in('id', allCustomerIds)
    .is('deleted_at', null);
  if (custErr) throw new Error(`Merge customer load failed: ${custErr.message}`);

  const byId = new Map((customerRows || []).map((r) => [r.id, r]));
  const survivor = byId.get(survivorId);
  if (!survivor) {
    throw new Error('Survivor customer not found or already deleted');
  }

  for (const id of loserCustIds) {
    if (!byId.has(id)) {
      throw new Error(`Loser customer ${id} not found or already deleted`);
    }
  }

  let workingSurvivorId = survivorId;
  let workingSurvivor = survivor;
  let promotion = null;

  const promotionPair = detectPromotionPair(
    [survivor, ...loserCustIds.map((id) => byId.get(id))].filter(Boolean)
  );

  // Prefer CP→C in-place promotion when synced CP + empty official C.
  if (promotionPair) {
    const cJobCount = await countJobsForCustomer(supabase, promotionPair.c.id);
    if (cJobCount === 0) {
      const officialCode = normalizePromotionCode(promotionPair.c.customer_code);
      const portalCodeBefore = promotionPair.cp.customer_code;
      // Vacate UNIQUE(customer_code) on the empty C row before renaming CP → C.
      await vacateCustomerCode(supabase, promotionPair.c.id, officialCode);
      const idx = loserCustIds.indexOf(promotionPair.c.id);
      if (idx >= 0) loserCustIds.splice(idx, 1);
      if (workingSurvivorId === promotionPair.c.id) {
        workingSurvivorId = promotionPair.cp.id;
      }

      let sapPromoteWarning = null;
      if (sessionCookies) {
        try {
          promotion = await promotePortalCustomerFromSap({
            supabase,
            sessionCookies,
            portalCustomerCode: portalCodeBefore,
            sapCardCode: officialCode,
          });
        } catch (promoteErr) {
          sapPromoteWarning = promoteErr.message;
          promotion = null;
        }
      }

      if (!promotion) {
        const { error: localPromoteErr } = await supabase
          .from('customer')
          .update({
            customer_code: officialCode,
            source: 'sap',
            sap_card_code: officialCode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', promotionPair.cp.id);
        if (localPromoteErr) {
          throw new Error(
            `Local CP→C promotion failed: ${localPromoteErr.message}${
              sapPromoteWarning ? ` (SAP: ${sapPromoteWarning})` : ''
            }`
          );
        }
        promotion = {
          action: 'promoted_local',
          from: portalCodeBefore,
          to: officialCode,
          id: promotionPair.cp.id,
          warning: sapPromoteWarning,
        };
      }

      const { data: promotedRow, error: promotedErr } = await supabase
        .from('customer')
        .select(
          'id, customer_code, customer_name, email, phone_number, sap_card_code, synced_to_sap_at, source'
        )
        .eq('id', promotionPair.cp.id)
        .maybeSingle();
      if (promotedErr) throw new Error(promotedErr.message);
      if (promotedRow) {
        workingSurvivorId = promotedRow.id;
        workingSurvivor = promotedRow;
        promotion = {
          ...promotion,
          vacatedDuplicateId: promotionPair.c.id,
        };
      }
    }
  }

  // Reload survivor after possible promotion.
  if (workingSurvivorId !== survivorId || promotion) {
    const { data: refreshed, error: refreshErr } = await supabase
      .from('customer')
      .select(
        'id, customer_code, customer_name, email, phone_number, sap_card_code, synced_to_sap_at, source'
      )
      .eq('id', workingSurvivorId)
      .is('deleted_at', null)
      .maybeSingle();
    if (refreshErr) throw new Error(refreshErr.message);
    if (!refreshed) throw new Error('Survivor missing after promotion');
    workingSurvivor = refreshed;
  }

  const remainingLosers = loserCustIds.filter((id) => id !== workingSurvivorId);
  const totals = {
    jobs: 0,
    contacts: 0,
    customer_location: 0,
    equipments: 0,
    customer_notes: 0,
    service_call: 0,
    leads: 0,
    locations: 0,
    addressDetailsMoved: 0,
    addressDetailsSoftDeleted: 0,
    customersSoftDeleted: 0,
    sapLeadsSoftDeleted: 0,
  };

  const loserSummaries = [];

  for (const loserId of remainingLosers) {
    const loser = byId.get(loserId);
    if (!loser) continue;
    // Skip if already soft-deleted by promotion vacate.
    const { data: stillActive } = await supabase
      .from('customer')
      .select('id, customer_code, customer_name')
      .eq('id', loserId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!stillActive) {
      loserSummaries.push({
        id: loserId,
        code: loser.customer_code,
        action: 'already_soft_deleted',
      });
      continue;
    }

    const fkCounts = await reassignCustomerFks(supabase, loserId, workingSurvivorId);
    for (const [k, v] of Object.entries(fkCounts)) {
      totals[k] = (totals[k] || 0) + v;
    }

    const addr = await rewriteAddressDetailsCode(
      supabase,
      stillActive.customer_code,
      workingSurvivor.customer_code
    );
    totals.addressDetailsMoved += addr.moved;
    totals.addressDetailsSoftDeleted += addr.softDeletedDuplicates;

    await vacateCustomerCode(supabase, loserId, stillActive.customer_code);
    totals.customersSoftDeleted += 1;
    loserSummaries.push({
      id: loserId,
      code: stillActive.customer_code,
      action: 'merged_soft_deleted',
      fkCounts,
      addressDetails: addr,
    });
  }

  // sap_lead losers + any L* codes from merged customers.
  const leadIdsToDelete = new Set(loserLeadIds);
  for (const summary of loserSummaries) {
    if (getAccountType(summary.code) === 'L') {
      const lead = await loadSapLeadByCode(supabase, summary.code);
      if (lead?.id) leadIdsToDelete.add(lead.id);
    }
  }
  // Also if survivor gained an L sap_card_code stamp from lead codes in merge set.
  for (const leadId of leadIdsToDelete) {
    const { data: lead } = await supabase
      .from('sap_lead')
      .select('id, lead_code')
      .eq('id', leadId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!lead) continue;

    await softDeleteSapLead(supabase, lead.id);
    totals.sapLeadsSoftDeleted += 1;

    if (!workingSurvivor.sap_card_code) {
      const { error: stampErr } = await supabase
        .from('customer')
        .update({
          sap_card_code: lead.lead_code,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workingSurvivorId);
      if (stampErr) throw new Error(`Failed to stamp sap_card_code: ${stampErr.message}`);
      workingSurvivor.sap_card_code = lead.lead_code;
    }
  }

  return {
    survivor: {
      id: workingSurvivor.id,
      code: workingSurvivor.customer_code,
      name: workingSurvivor.customer_name,
      sapCardCode: workingSurvivor.sap_card_code || null,
    },
    losers: loserSummaries,
    promotion,
    counts: totals,
  };
}
