/**
 * POST /api/customers/merge
 * Admin: consolidate duplicate customers onto one survivor UUID.
 * Body: { survivorId, loserIds?: string[], loserCustomerIds?: string[],
 *         loserSapLeadIds?: string[], confirm: true }
 */

import { requireAdminUser } from '../company-memos/_auth';
import { mergeCustomers } from '../../../lib/customers/mergeCustomers';
import sapService from '../../../lib/services/sapService';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../lib/services/auditLog';
import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';
import { PORTAL_LIST_CACHE_PREFIX } from '../../../lib/leads/portalListCache';
import customerCache from '../../../lib/utils/customerCache';

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body || {};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const body = parseBody(req);
  const survivorId = typeof body.survivorId === 'string' ? body.survivorId.trim() : '';
  const confirm = body.confirm === true;

  const loserCustomerIds = [
    ...(Array.isArray(body.loserCustomerIds) ? body.loserCustomerIds : []),
    ...(Array.isArray(body.loserIds) ? body.loserIds : []),
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  const loserSapLeadIds = (Array.isArray(body.loserSapLeadIds) ? body.loserSapLeadIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  // Support typed losers: [{ id, entityType: 'customer'|'sap_lead' }]
  if (Array.isArray(body.losers)) {
    for (const item of body.losers) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      if (item.entityType === 'sap_lead') loserSapLeadIds.push(id);
      else loserCustomerIds.push(id);
    }
  }

  if (!survivorId) {
    return res.status(400).json({ success: false, error: 'survivorId is required' });
  }
  if (!confirm) {
    return res.status(400).json({
      success: false,
      error: 'Merge requires confirm: true',
    });
  }
  if (loserCustomerIds.length === 0 && loserSapLeadIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Provide at least one loser customer or sap_lead id',
    });
  }

  const sessionCookies = sapService.getSessionCookies(req) || null;

  try {
    const result = await mergeCustomers(auth.admin, {
      survivorId,
      loserCustomerIds,
      loserSapLeadIds,
      sessionCookies,
      confirm: true,
    });

    invalidateListCache(PORTAL_LIST_CACHE_PREFIX);
    invalidateListCache('customers-sap-masterlist');
    if (result.survivor?.code) {
      customerCache.invalidateCustomer(result.survivor.code);
    }
    for (const loser of result.losers || []) {
      if (loser.code) customerCache.invalidateCustomer(loser.code);
    }

    await writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.CUSTOMER_MERGE,
      category: AUDIT_CATEGORIES.CUSTOMER,
      entityType: 'customer',
      entityId: result.survivor.id,
      entityLabel: result.survivor.code || result.survivor.name,
      description: `Merged ${result.counts.customersSoftDeleted} customer(s) and ${result.counts.sapLeadsSoftDeleted} SAP lead(s) into ${result.survivor.code}`,
      details: {
        survivorId: result.survivor.id,
        survivorCode: result.survivor.code,
        losers: result.losers,
        promotion: result.promotion,
        counts: result.counts,
        requestedLoserCustomerIds: loserCustomerIds,
        requestedLoserSapLeadIds: loserSapLeadIds,
      },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({
      success: true,
      message: `Merged into ${result.survivor.code}`,
      survivor: result.survivor,
      losers: result.losers,
      promotion: result.promotion,
      counts: result.counts,
    });
  } catch (err) {
    console.error('[customers/merge]', err);
    await writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.CUSTOMER_MERGE,
      category: AUDIT_CATEGORIES.CUSTOMER,
      entityType: 'customer',
      entityId: survivorId,
      entityLabel: survivorId,
      description: 'Customer merge failed',
      details: {
        error: err.message,
        survivorId,
        loserCustomerIds,
        loserSapLeadIds,
      },
      status: AUDIT_STATUS.FAILURE,
    });
    return res.status(500).json({
      success: false,
      error: err.message || 'Merge failed',
    });
  }
}
