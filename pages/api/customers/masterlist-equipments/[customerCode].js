/**
 * GET — equipments for a masterlist customer by customer_code (SAP CardCode).
 * Uses SAP sql08 first, then portal public.equipments.
 */

import { fetchEquipmentsByCardCode } from '../../../../lib/customers/fetchSapCustomerData';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const raw = req.query.customerCode;
  const customerCode = raw != null ? String(raw).trim() : '';
  if (!customerCode) {
    return res.status(400).json({ success: false, error: 'customerCode is required' });
  }

  try {
    let customerId = null;
    try {
      const supabase = getSupabaseAdmin();
      const { data: customer } = await supabase
        .from('customer')
        .select('id')
        .eq('customer_code', customerCode)
        .is('deleted_at', null)
        .maybeSingle();
      customerId = customer?.id ?? null;
    } catch {
      // Optional — SAP path does not require masterlist row
    }

    const { source, equipments } = await fetchEquipmentsByCardCode(customerCode, { req });

    return res.status(200).json({
      success: true,
      customerId,
      source,
      equipments,
    });
  } catch (err) {
    console.error('masterlist-equipments unexpected:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  }
}
