import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { fetchAddressDetailsMaps } from '../../../../lib/customers/addressDetailsMaps';
import {
  sapPartnerFromSupabaseCustomerBundle,
  SUPABASE_CUSTOMER_WITH_LOCATIONS_SELECT,
} from '../../../../lib/customers/supabaseCustomerSapShim';

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

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const [customerResult, addressDetails] = await Promise.all([
      supabase
        .from('customer')
        .select(SUPABASE_CUSTOMER_WITH_LOCATIONS_SELECT)
        .eq('customer_code', customerCode)
        .is('deleted_at', null)
        .maybeSingle(),
      fetchAddressDetailsMaps(supabase, customerCode),
    ]);

    const { data: row, error: sbErr } = customerResult;

    if (sbErr) {
      console.error('masterlist-bundle select:', sbErr);
      return res.status(500).json({ success: false, error: sbErr.message });
    }

    if (!row) {
      return res.status(200).json({
        success: true,
        partner: null,
        addressDetails,
      });
    }

    return res.status(200).json({
      success: true,
      partner: sapPartnerFromSupabaseCustomerBundle(row),
      addressDetails,
    });
  } catch (err) {
    console.error('masterlist-bundle:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  }
}
