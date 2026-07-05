/**
 * Verify portal customers against the current SAP company DB and support batched re-sync.
 */

import sapService from '../services/sapService';
import { syncCustomerToSapCore } from './syncCustomerToSapCore';
import { getEffectiveSapCardCode, tryLinkExistingSapPartner } from './sapCustomerLinkHelpers';

import { getCurrentSapSyncEnvironment } from './sapSyncEnvironment';

export { getEffectiveSapCardCode, tryLinkExistingSapPartner } from './sapCustomerLinkHelpers';
export { getCurrentSapSyncEnvironment as getCurrentSapEnvironment } from './sapSyncEnvironment';

export const VERIFY_BATCH_CAP = 25;

const CUSTOMER_VERIFY_SELECT =
  'id, customer_code, customer_name, email, phone_number, synced_to_sap_at, sap_card_code, sap_sync_environment, sap_sync_verified_at';

function environmentNeedsResync(customer) {
  const currentEnv = getCurrentSapSyncEnvironment();
  if (!currentEnv || !customer?.sap_sync_environment) return false;
  return customer.sap_sync_environment !== currentEnv;
}

/**
 * Verify one customer against the current SAP session.
 */
export async function verifyCustomerSapStatus(customer, sessionCookies, { supabase = null, persistVerification = false } = {}) {
  const verifiedAt = new Date().toISOString();
  const sapCardCode = getEffectiveSapCardCode(customer);

  if (!customer?.synced_to_sap_at) {
    return {
      inSap: false,
      needsResync: true,
      sapCardCode,
      verifiedAt,
      reason: 'never_synced',
      sapEnvironment: getCurrentSapSyncEnvironment(),
    };
  }

  if (environmentNeedsResync(customer)) {
    const result = {
      inSap: false,
      needsResync: true,
      sapCardCode,
      verifiedAt,
      reason: 'environment_mismatch',
      sapEnvironment: getCurrentSapSyncEnvironment(),
      previousEnvironment: customer.sap_sync_environment,
    };
    if (persistVerification && supabase) {
      await stampCustomerVerification(supabase, customer.id, { verifiedAt, needsResync: true });
    }
    return result;
  }

  if (!sapCardCode) {
    const result = {
      inSap: false,
      needsResync: true,
      sapCardCode: null,
      verifiedAt,
      reason: 'no_sap_card_code',
      sapEnvironment: getCurrentSapSyncEnvironment(),
    };
    if (persistVerification && supabase) {
      await stampCustomerVerification(supabase, customer.id, { verifiedAt, needsResync: true });
    }
    return result;
  }

  const inSap = await sapService.businessPartnerExists(sapCardCode, sessionCookies);
  if (inSap) {
    const result = {
      inSap: true,
      needsResync: false,
      sapCardCode,
      verifiedAt,
      reason: 'exists_in_sap',
      sapEnvironment: getCurrentSapSyncEnvironment(),
    };
    if (persistVerification && supabase) {
      await stampCustomerVerification(supabase, customer.id, { verifiedAt, needsResync: false });
    }
    return result;
  }

  const linkResult = await tryLinkExistingSapPartner(customer, sessionCookies);
  if (linkResult?.sapCardCode) {
    const result = {
      inSap: true,
      needsResync: false,
      sapCardCode: linkResult.sapCardCode,
      verifiedAt,
      reason: 'linked_by_lookup',
      match: linkResult.match,
      sapEnvironment: getCurrentSapSyncEnvironment(),
      linkCandidate: true,
    };
    if (persistVerification && supabase) {
      await stampCustomerVerification(supabase, customer.id, { verifiedAt, needsResync: false });
    }
    return result;
  }

  const result = {
    inSap: false,
    needsResync: true,
    sapCardCode,
    verifiedAt,
    reason: 'missing_in_sap',
    sapEnvironment: getCurrentSapSyncEnvironment(),
  };
  if (persistVerification && supabase) {
    await stampCustomerVerification(supabase, customer.id, { verifiedAt, needsResync: true });
  }
  return result;
}

async function stampCustomerVerification(supabase, customerId, { verifiedAt, needsResync }) {
  const payload = { sap_sync_verified_at: verifiedAt };
  if (!needsResync) {
    const env = getCurrentSapSyncEnvironment();
    if (env) payload.sap_sync_environment = env;
  }
  await supabase.from('customer').update(payload).eq('id', customerId);
}

/**
 * Fetch a page of customers that have been marked as synced to SAP.
 */
export async function fetchSyncedCustomersPage(supabase, { offset = 0, limit = VERIFY_BATCH_CAP } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || VERIFY_BATCH_CAP, 1), VERIFY_BATCH_CAP);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { data, error, count } = await supabase
    .from('customer')
    .select(CUSTOMER_VERIFY_SELECT, { count: 'exact' })
    .not('synced_to_sap_at', 'is', null)
    .is('deleted_at', null)
    .order('synced_to_sap_at', { ascending: true })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) throw error;
  return { customers: data || [], total: count ?? 0, offset: safeOffset, limit: safeLimit };
}

function bucketCustomer(customer, status) {
  const base = {
    id: customer.id,
    customer_code: customer.customer_code,
    customer_name: customer.customer_name,
    sap_card_code: customer.sap_card_code,
    synced_to_sap_at: customer.synced_to_sap_at,
    email: customer.email,
  };

  if (status.reason === 'no_sap_card_code') {
    return { bucket: 'no_sap_card_code', customer: base, status };
  }
  if (status.inSap) {
    return { bucket: 'exists_in_sap', customer: base, status };
  }
  return { bucket: 'missing_in_sap', customer: base, status };
}

/**
 * Preview verification for a batch of synced customers.
 */
export async function previewSapCustomerVerification({ supabase, sessionCookies, offset = 0, limit = VERIFY_BATCH_CAP }) {
  if (!sessionCookies) {
    return { error: 'SAP session unavailable', buckets: null };
  }

  const page = await fetchSyncedCustomersPage(supabase, { offset, limit });
  const buckets = {
    exists_in_sap: [],
    missing_in_sap: [],
    no_sap_card_code: [],
  };

  for (const customer of page.customers) {
    const status = await verifyCustomerSapStatus(customer, sessionCookies, {
      supabase,
      persistVerification: true,
    });
    const { bucket, customer: row, status: st } = bucketCustomer(customer, status);
    buckets[bucket].push({ ...row, verification: st });
  }

  return {
    buckets,
    pagination: {
      offset: page.offset,
      limit: page.limit,
      processed: page.customers.length,
      total: page.total,
      hasMore: page.offset + page.customers.length < page.total,
    },
    sapEnvironment: getCurrentSapSyncEnvironment(),
    counts: {
      exists_in_sap: buckets.exists_in_sap.length,
      missing_in_sap: buckets.missing_in_sap.length,
      no_sap_card_code: buckets.no_sap_card_code.length,
    },
  };
}

/**
 * Clear stale SAP activity IDs for jobs tied to given customers.
 */
export async function clearJobsSapSyncForCustomers(supabase, customerIds) {
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  if (!ids.length) return { cleared: 0 };

  const { data, error } = await supabase
    .from('jobs')
    .update({ sap_activity_id: null, last_synced_at: null })
    .in('customer_id', ids)
    .not('sap_activity_id', 'is', null)
    .is('deleted_at', null)
    .select('id');

  if (error) throw error;
  return { cleared: data?.length ?? 0 };
}

async function findLeadForCustomer(supabase, customerId) {
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  return leads?.[0] ?? null;
}

/**
 * Re-sync missing customers: link when possible, otherwise clear flags and create in SAP.
 */
export async function resyncMissingSapCustomers({
  supabase,
  sessionCookies,
  customers,
  includeJobs = false,
  req = null,
}) {
  const results = {
    linked: [],
    created: [],
    existing: [],
    failed: [],
    skipped: [],
  };

  const affectedCustomerIds = [];

  for (const customer of customers || []) {
    try {
      const status = await verifyCustomerSapStatus(customer, sessionCookies);
      if (status.inSap && !status.needsResync) {
        results.existing.push({ customerId: customer.id, sapCardCode: status.sapCardCode, reason: status.reason });
        continue;
      }

      if (status.linkCandidate) {
        const linkResult = await syncCustomerToSapCore({
          customer,
          lead: await findLeadForCustomer(supabase, customer.id),
          sessionCookies,
          supabase,
          req,
        });
        if (linkResult.success) {
          results.linked.push({
            customerId: customer.id,
            sapCardCode: linkResult.sapCardCode,
            action: linkResult.action,
          });
          affectedCustomerIds.push(customer.id);
          continue;
        }
      }

      await supabase
        .from('customer')
        .update({
          synced_to_sap_at: null,
          sap_card_code: null,
          sap_sync_verified_at: null,
        })
        .eq('id', customer.id);

      const refreshed = { ...customer, synced_to_sap_at: null, sap_card_code: null };
      const lead = await findLeadForCustomer(supabase, customer.id);
      const syncResult = await syncCustomerToSapCore({
        customer: refreshed,
        lead,
        sessionCookies,
        supabase,
        req,
      });

      if (!syncResult.success) {
        results.failed.push({
          customerId: customer.id,
          customerCode: customer.customer_code,
          error: syncResult.error,
          validationErrors: syncResult.validationErrors,
        });
        continue;
      }

      affectedCustomerIds.push(customer.id);
      if (syncResult.action === 'linked') {
        results.linked.push({ customerId: customer.id, sapCardCode: syncResult.sapCardCode });
      } else if (syncResult.action === 'created') {
        results.created.push({ customerId: customer.id, sapCardCode: syncResult.sapCardCode });
      } else {
        results.existing.push({ customerId: customer.id, sapCardCode: syncResult.sapCardCode });
      }
    } catch (err) {
      results.failed.push({
        customerId: customer.id,
        customerCode: customer.customer_code,
        error: err?.message || 'Resync failed',
      });
    }
  }

  let jobsCleared = 0;
  if (includeJobs && affectedCustomerIds.length) {
    const clearResult = await clearJobsSapSyncForCustomers(supabase, affectedCustomerIds);
    jobsCleared = clearResult.cleared;
  }

  return { results, jobsCleared, affectedCustomerIds };
}

/**
 * Re-sync a batch of missing customers discovered via preview pagination.
 */
export async function resyncMissingSapCustomersPage({
  supabase,
  sessionCookies,
  offset = 0,
  limit = VERIFY_BATCH_CAP,
  includeJobs = false,
  req = null,
}) {
  const preview = await previewSapCustomerVerification({ supabase, sessionCookies, offset, limit });
  if (preview.error) return { error: preview.error, preview: null, resync: null };

  const toResync = [
    ...preview.buckets.missing_in_sap.map((r) => ({
      ...r,
      id: r.id,
      customer_code: r.customer_code,
      customer_name: r.customer_name,
      email: r.email,
      sap_card_code: r.sap_card_code,
      synced_to_sap_at: r.synced_to_sap_at,
    })),
    ...preview.buckets.no_sap_card_code.map((r) => ({
      ...r,
      id: r.id,
      customer_code: r.customer_code,
      customer_name: r.customer_name,
      email: r.email,
      sap_card_code: r.sap_card_code,
      synced_to_sap_at: r.synced_to_sap_at,
    })),
  ];

  const resync = await resyncMissingSapCustomers({
    supabase,
    sessionCookies,
    customers: toResync,
    includeJobs,
    req,
  });

  return { preview, resync };
}
