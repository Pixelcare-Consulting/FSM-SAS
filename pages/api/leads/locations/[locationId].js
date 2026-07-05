import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { updatePortalServiceLocation } from '../../../../lib/customers/updatePortalServiceLocation';

function jsonBody(req) {
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
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const locationId = req.query.locationId ? String(req.query.locationId).trim() : '';
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const body = jsonBody(req);
    const leadCode = String(req.query.leadCode || body.leadCode || '').trim();
    const addressName = String(body.addressName ?? '').trim();
    const addressType = body.addressType;
    const fullAddress = String(body.fullAddress ?? '').trim();

    if (!leadCode) {
      return res.status(400).json({ error: 'leadCode is required' });
    }
    if (!addressName) {
      return res.status(400).json({ error: 'addressName is required' });
    }
    if (!fullAddress) {
      return res.status(400).json({ error: 'fullAddress is required' });
    }

    const supabase = getSupabaseAdmin();
    const result = await updatePortalServiceLocation({
      supabase,
      req,
      table: 'sap_lead_location',
      locationId,
      ownerCode: leadCode,
      ownerKind: 'lead',
      addressName,
      addressType,
      fullAddress,
    });

    return res.status(200).json({
      success: true,
      message: 'Service location updated',
      ...result,
    });
  } catch (error) {
    console.error('Unexpected error in leads locations PATCH API:', error);
    const message = error?.message || 'Internal server error';
    const status =
      message.includes('not found') ? 404 : message.includes('required') ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
