/**
 * Shared Portal customer → SAP Business Partner sync (create, link, or confirm existing).
 * Used by sync-to-sap API, verify-sap-sync resync, and lead convert flows.
 */

import sapService from '../services/sapService';
import { customerService } from '../supabase/database';
import { transformToSAPBusinessPartner, validateBusinessPartnerData } from '../utils/sapBusinessPartnerTransform';
import { ensurePortalCustomerAddressFromLead } from './ensurePortalCustomerAddressFromLead';
import {
  writeSapCustomerSyncAuditFromRequest,
  writeAuditLogFromRequest,
  formatSapCustomerSyncAuditDescription,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../services/auditLog';
import {
  getEffectiveSapCardCode,
  tryLinkExistingSapPartner,
  tryLinkExistingSapLeadPartner,
} from './sapCustomerLinkHelpers';
import { upsertSapLeadMasterlistFromSap } from '../leads/upsertSapLeadMasterlistFromSap';
import { sapSyncStampFields } from './sapSyncEnvironment';

function isOurInternalCP(code) {
  return typeof code === 'string' && /^CP\d+$/i.test(code);
}

function sapCardTypeFromCode(sapCardCode) {
  const code = String(sapCardCode || '').trim().toUpperCase();
  if (code.startsWith('L')) return 'L';
  if (code.startsWith('C')) return 'C';
  return null;
}

/**
 * Stamp SAP sync metadata on customer after successful sync or link.
 */
export function buildSapSyncUpdatePayload(sapCardCode, customer) {
  const customerCode = customer.customer_code;
  const keepInternalCP = isOurInternalCP(customerCode);
  const updatePayload = { ...sapSyncStampFields() };

  if (sapCardCode && !keepInternalCP) {
    updatePayload.customer_code = sapCardCode;
  } else if (sapCardCode && keepInternalCP) {
    updatePayload.sap_card_code = sapCardCode;
  }
  return updatePayload;
}

async function loadCustomerForVerify(customerId) {
  const row = await customerService.findById(customerId);
  return row || null;
}

async function finalizeSuccessfulSapSync({
  customer,
  sapCardCode,
  action,
  businessPartner,
  sessionCookies,
  supabase,
  lead,
  req,
  match,
  addressSyncWarning = null,
}) {
  const cardType = sapCardTypeFromCode(sapCardCode);
  let masterlistSynced = false;
  let masterlistWarning = null;

  if (cardType === 'L' && supabase && sapCardCode) {
    try {
      await upsertSapLeadMasterlistFromSap({
        supabase,
        sapCardCode,
        sessionCookies,
        portalLead: lead,
      });
      masterlistSynced = true;
      if (req) {
        await writeAuditLogFromRequest(req, {
          action: AUDIT_ACTIONS.LEAD_SYNC,
          category: AUDIT_CATEGORIES.LEAD,
          entityType: 'sap_lead',
          entityId: sapCardCode,
          entityLabel: customer.customer_name || sapCardCode,
          description: `SAP Lead masterlist upserted: ${sapCardCode} from portal convert`,
          details: {
            customerId: customer.id,
            sapCardCode,
            action,
            source: 'lead_convert',
          },
          status: AUDIT_STATUS.SUCCESS,
        });
      }
    } catch (masterlistErr) {
      masterlistWarning = masterlistErr?.message || 'SAP Lead masterlist upsert failed';
      console.warn('syncCustomerToSapCore: sap_lead masterlist upsert failed:', masterlistWarning);
    }
  }

  const refreshedCustomer = (await loadCustomerForVerify(customer.id)) || customer;
  const { verifyCustomerSapStatus } = await import('./verifySapCustomerSync.js');
  const verification = await verifyCustomerSapStatus(refreshedCustomer, sessionCookies, { supabase });

  if (!verification.inSap || verification.needsResync) {
    return {
      success: false,
      error: verification.reason === 'environment_mismatch'
        ? 'SAP company database mismatch — lead not verified in current SAP environment'
        : 'SAP Lead verification failed — Business Partner not found in current SAP company',
      sapCardCode,
      cardType,
      action,
      businessPartner,
      match,
      masterlistSynced,
      masterlistWarning,
      verification,
      addressSyncWarning,
    };
  }

  return {
    success: true,
    action,
    sapCardCode,
    cardType,
    businessPartner,
    match,
    masterlistSynced,
    masterlistWarning,
    verification,
    addressSyncWarning,
  };
}

/**
 * Sync one portal customer to SAP (link if found, create otherwise).
 * @returns {Promise<{ success: boolean, action?: string, sapCardCode?: string, cardType?: string, businessPartner?: object, error?: string, validationErrors?: string[], addressSyncWarning?: string, masterlistSynced?: boolean, masterlistWarning?: string, verification?: object }>}
 */
export async function syncCustomerToSapCore({
  customer,
  lead = null,
  sessionCookies,
  supabase = null,
  req = null,
  preferLeadType = false,
}) {
  if (!customer?.id || !sessionCookies) {
    return { success: false, error: 'Missing customer or SAP session' };
  }

  const customerCode = customer.customer_code;
  const isLEADCode = typeof customerCode === 'string' && customerCode.startsWith('LEAD-');
  const isRealSAPCardCode =
    typeof customerCode === 'string' &&
    /^[A-Za-z0-9]{1,15}$/.test(customerCode) &&
    !isOurInternalCP(customerCode) &&
    !isLEADCode;

  const effectiveCode = getEffectiveSapCardCode(customer);
  const effectiveIsLead = effectiveCode && String(effectiveCode).toUpperCase().startsWith('L');
  const effectiveIsCustomer = effectiveCode && String(effectiveCode).toUpperCase().startsWith('C');

  if (effectiveCode && (!preferLeadType || effectiveIsLead)) {
    const existsInSAP = await sapService.businessPartnerExists(effectiveCode, sessionCookies);
    if (existsInSAP) {
      const existingBP = await sapService.getBusinessPartner(effectiveCode, sessionCookies);
      const updatePayload = buildSapSyncUpdatePayload(effectiveCode, customer);
      try {
        await customerService.update(customer.id, updatePayload);
      } catch (updateError) {
        console.warn('syncCustomerToSapCore: failed to update customer after exists check:', updateError);
      }
      if (req) {
        await writeSapCustomerSyncAuditFromRequest(req, {
          entityType: 'customer',
          entityId: customer.id,
          entityLabel: customer.customer_name || effectiveCode,
          description: formatSapCustomerSyncAuditDescription({
            customerName: customer.customer_name,
            cardCode: effectiveCode,
            outcome: 'exists',
          }),
          details: { customerId: customer.id, customerCode, sapCardCode: effectiveCode, action: 'existing' },
          status: AUDIT_STATUS.SUCCESS,
        });
      }
      return finalizeSuccessfulSapSync({
        customer,
        sapCardCode: effectiveCode,
        action: 'existing',
        businessPartner: existingBP,
        sessionCookies,
        supabase,
        lead,
        req,
      });
    }
  } else if (!preferLeadType && isRealSAPCardCode) {
    const existsInSAP = await sapService.businessPartnerExists(customerCode, sessionCookies);
    if (existsInSAP) {
      const existingBP = await sapService.getBusinessPartner(customerCode, sessionCookies);
      const updatePayload = buildSapSyncUpdatePayload(customerCode, customer);
      await customerService.update(customer.id, updatePayload);
      if (req) {
        await writeSapCustomerSyncAuditFromRequest(req, {
          entityType: 'customer',
          entityId: customer.id,
          entityLabel: customer.customer_name || customerCode,
          description: formatSapCustomerSyncAuditDescription({
            customerName: customer.customer_name,
            cardCode: customerCode,
            outcome: 'exists',
          }),
          details: { customerId: customer.id, customerCode, action: 'existing' },
          status: AUDIT_STATUS.SUCCESS,
        });
      }
      return finalizeSuccessfulSapSync({
        customer,
        sapCardCode: customerCode,
        action: 'existing',
        businessPartner: existingBP,
        sessionCookies,
        supabase,
        lead,
        req,
      });
    }
  } else if (preferLeadType && effectiveIsCustomer) {
    // Skip linking to stale C* codes when convert expects a SAP Lead (L*).
  }

  const linkResult = preferLeadType
    ? await tryLinkExistingSapLeadPartner(customer, sessionCookies)
    : await tryLinkExistingSapPartner(customer, sessionCookies);

  if (linkResult?.sapCardCode) {
    const updatePayload = buildSapSyncUpdatePayload(linkResult.sapCardCode, customer);
    await customerService.update(customer.id, updatePayload);
    if (req) {
      await writeSapCustomerSyncAuditFromRequest(req, {
        entityType: 'customer',
        entityId: customer.id,
        entityLabel: customer.customer_name || linkResult.sapCardCode,
        description: formatSapCustomerSyncAuditDescription({
          customerName: customer.customer_name,
          cardCode: linkResult.sapCardCode,
          outcome: 'linked',
        }),
        details: {
          customerId: customer.id,
          customerCode,
          sapCardCode: linkResult.sapCardCode,
          match: linkResult.match,
          contactMismatch: Boolean(linkResult.contactMismatch),
          linkConfidence: linkResult.linkConfidence || null,
          action: 'linked',
        },
        status: AUDIT_STATUS.SUCCESS,
      });
    }
    return finalizeSuccessfulSapSync({
      customer,
      sapCardCode: linkResult.sapCardCode,
      action: 'linked',
      businessPartner: linkResult.businessPartner,
      sessionCookies,
      supabase,
      lead,
      req,
      match: linkResult.match,
    });
  }

  const sapBusinessPartnerData = transformToSAPBusinessPartner(customer, lead);
  const validation = validateBusinessPartnerData(sapBusinessPartnerData);
  if (!validation.isValid) {
    if (req) {
      await writeSapCustomerSyncAuditFromRequest(req, {
        entityType: 'customer',
        entityId: customer.id,
        entityLabel: customer.customer_name || customerCode,
        description: formatSapCustomerSyncAuditDescription({
          customerName: customer.customer_name,
          cardCode: customerCode,
          error: 'BusinessPartner data validation failed',
        }),
        details: { customerId: customer.id, customerCode, errors: validation.errors },
        status: AUDIT_STATUS.FAILURE,
      });
    }
    return {
      success: false,
      error: 'BusinessPartner data validation failed',
      validationErrors: validation.errors,
    };
  }

  let createdBP;
  try {
    createdBP = await sapService.createBusinessPartner(sapBusinessPartnerData, sessionCookies);
  } catch (error) {
    if (req) {
      await writeSapCustomerSyncAuditFromRequest(req, {
        entityType: 'customer',
        entityId: customer.id,
        entityLabel: customer.customer_name || customerCode,
        description: formatSapCustomerSyncAuditDescription({
          customerName: customer.customer_name,
          cardCode: customerCode,
          error: error.message,
        }),
        details: { customerId: customer.id, customerCode, error: error.message },
        status: AUDIT_STATUS.FAILURE,
      });
    }
    return { success: false, error: error.message };
  }

  const sapCardCode = createdBP.CardCode ?? createdBP.cardCode;
  if (!sapCardCode) {
    if (req) {
      await writeSapCustomerSyncAuditFromRequest(req, {
        entityType: 'customer',
        entityId: customer.id,
        entityLabel: customer.customer_name || customerCode,
        description: formatSapCustomerSyncAuditDescription({
          customerName: customer.customer_name,
          cardCode: customerCode,
          error: 'SAP did not return a CardCode',
        }),
        details: { customerId: customer.id, customerCode, action: 'created' },
        status: AUDIT_STATUS.FAILURE,
      });
    }
    return { success: false, error: 'SAP did not return a CardCode' };
  }

  const updatePayload = buildSapSyncUpdatePayload(sapCardCode, customer);
  try {
    await customerService.update(customer.id, updatePayload);
  } catch (updateError) {
    console.warn('syncCustomerToSapCore: failed to update customer after create:', updateError);
  }

  let addressSyncWarning = null;
  if (lead && supabase) {
    try {
      await ensurePortalCustomerAddressFromLead({
        supabase,
        customerId: customer.id,
        lead,
      });
    } catch (addrErr) {
      addressSyncWarning = addrErr?.message || 'Address sync failed';
      console.warn('syncCustomerToSapCore: address sync failed:', addressSyncWarning);
    }
  }

  if (req) {
    await writeSapCustomerSyncAuditFromRequest(req, {
      entityType: 'customer',
      entityId: customer.id,
      entityLabel: customer.customer_name || customerCode,
      description: formatSapCustomerSyncAuditDescription({
        customerName: customer.customer_name,
        cardCode: sapCardCode || customerCode,
        outcome: addressSyncWarning ? 'address_partial' : 'created',
        error: addressSyncWarning || undefined,
      }),
      details: {
        customerId: customer.id,
        customerCode,
        sapCardCode: sapCardCode || null,
        action: 'created',
        addressSyncWarning,
      },
      status: addressSyncWarning ? AUDIT_STATUS.WARNING : AUDIT_STATUS.SUCCESS,
    });
  }

  return finalizeSuccessfulSapSync({
    customer,
    sapCardCode,
    action: 'created',
    businessPartner: createdBP,
    sessionCookies,
    supabase,
    lead,
    req,
    addressSyncWarning,
  });
}
