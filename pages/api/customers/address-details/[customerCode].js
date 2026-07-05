import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { fetchAddressDetailsMaps } from '../../../../lib/customers/addressDetailsMaps';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customerCode } = req.query;

    if (!customerCode) {
      return res.status(400).json({ error: 'customerCode is required' });
    }

    const supabase = getSupabaseAdmin();
    const addressDetails = await fetchAddressDetailsMaps(supabase, customerCode);

    return res.status(200).json({
      success: true,
      data: addressDetails.data,
      dataByCustomerLocationId: addressDetails.dataByCustomerLocationId,
    });
  } catch (error) {
    console.error('Unexpected error in address-details GET API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}
