/**
 * GET — full SAP-shaped lead bundle for masterlist detail tabs (service role).
 */

import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { fetchAddressDetailsMaps } from '../../../../lib/customers/addressDetailsMaps';
import {
  sapPartnerFromSupabaseLeadBundle,
  SUPABASE_SAP_LEAD_MASTERLIST_SELECT,
} from '../../../../lib/leads/supabaseLeadSapShim';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const raw = req.query.leadCode;
  const leadCode = raw != null ? String(raw).trim() : '';
  if (!leadCode) {
    return res.status(400).json({ success: false, error: 'leadCode is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const [leadResult, addressDetails] = await Promise.all([
      supabase
        .from('sap_lead')
        .select(SUPABASE_SAP_LEAD_MASTERLIST_SELECT)
        .eq('lead_code', leadCode)
        .is('deleted_at', null)
        .maybeSingle(),
      fetchAddressDetailsMaps(supabase, leadCode),
    ]);

    const { data: row, error: sbErr } = leadResult;

    if (sbErr) {
      console.error('leads/masterlist-bundle select:', sbErr);
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
      partner: sapPartnerFromSupabaseLeadBundle(row),
      addressDetails,
    });
  } catch (err) {
    console.error('leads/masterlist-bundle:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  }
}
