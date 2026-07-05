/**
 * GET /api/customers/sap-status/[id]
 * Lightweight per-customer SAP verification against the current company DB.
 */

import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import sapService from '../../../../lib/services/sapService';
import { verifyCustomerSapStatus } from '../../../../lib/customers/verifySapCustomerSync';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Customer id is required' });
  }

  const sessionCookies = sapService.getSessionCookies(req);
  if (!sessionCookies) {
    return res.status(401).json({
      success: false,
      error: 'SAP session expired or invalid',
      message: 'Please log in to SAP first',
    });
  }

  const supabase = getSupabaseAdmin();
  const { data: customer, error } = await supabase
    .from('customer')
    .select(
      'id, customer_code, customer_name, email, synced_to_sap_at, sap_card_code, sap_sync_environment, sap_sync_verified_at'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }

  try {
    const status = await verifyCustomerSapStatus(customer, sessionCookies, {
      supabase,
      persistVerification: true,
    });

    return res.status(200).json({
      success: true,
      customerId: customer.id,
      customerCode: customer.customer_code,
      inSap: status.inSap,
      needsResync: status.needsResync,
      sapCardCode: status.sapCardCode,
      verifiedAt: status.verifiedAt,
      reason: status.reason,
      sapEnvironment: status.sapEnvironment,
      previousEnvironment: status.previousEnvironment ?? null,
      match: status.match ?? null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'SAP verification failed',
    });
  }
}
