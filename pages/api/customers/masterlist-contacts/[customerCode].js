/**
 * GET — contacts for a masterlist customer (public.contacts) by customer_code.
 * Uses service role so Create Job can load the same data as customer detail (nested embed),
 * even when browser RLS blocks direct .from('contacts') reads.
 */

import { getSupabaseAdmin } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.query.customerCode;
  const customerCode = raw != null ? String(raw).trim() : '';
  if (!customerCode) {
    return res.status(400).json({ error: 'customerCode is required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  try {
    const { data: customer, error: cErr } = await supabase
      .from('customer')
      .select('id')
      .eq('customer_code', customerCode)
      .is('deleted_at', null)
      .maybeSingle();

    if (cErr) {
      console.error('masterlist-contacts customer:', cErr);
      return res.status(500).json({ success: false, error: cErr.message });
    }

    if (!customer?.id) {
      return res.status(200).json({
        success: true,
        customerId: null,
        contacts: [],
      });
    }

    const { data: rows, error: ctErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('customer_id', customer.id)
      .order('id', { ascending: true });

    if (ctErr) {
      console.error('masterlist-contacts:', ctErr);
      return res.status(500).json({ success: false, error: ctErr.message });
    }

    return res.status(200).json({
      success: true,
      customerId: customer.id,
      contacts: rows || [],
    });
  } catch (err) {
    console.error('masterlist-contacts unexpected:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  }
}
