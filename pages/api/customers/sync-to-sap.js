/**
 * API endpoint to sync Portal customer to SAP BusinessPartners
 * POST /api/customers/sync-to-sap
 */

import sapService from '../../../lib/services/sapService';
import { customerService } from '../../../lib/supabase/database';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { syncCustomerToSapCore } from '../../../lib/customers/syncCustomerToSapCore';

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customer_id, customer_code } = req.body;

    if (!customer_id && !customer_code) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Either customer_id or customer_code must be provided',
      });
    }

    const sessionCookies = sapService.getSessionCookies(req);
    if (!sessionCookies) {
      return res.status(401).json({
        error: 'SAP session expired or invalid',
        message: 'Please log in to SAP first',
      });
    }

    let customer;
    if (customer_id) {
      customer = await customerService.findById(customer_id);
    } else {
      customer = await customerService.findByCode(customer_code);
    }

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: `Customer with ${customer_id ? 'id' : 'code'} ${customer_id || customer_code} not found`,
      });
    }

    const supabase = getSupabaseAdmin();
    let lead = null;

    if (customer_id || customer.id) {
      const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (leads?.length) lead = leads[0];
    }

    const result = await syncCustomerToSapCore({
      customer,
      lead,
      sessionCookies,
      supabase,
      req,
    });

    if (!result.success) {
      const status = result.validationErrors ? 400 : 500;
      return res.status(status).json({
        error: result.error || 'Sync failed',
        message: result.error,
        errors: result.validationErrors,
      });
    }

    const customerCode = customer.customer_code;
    const statusCode = result.action === 'created' ? 201 : 200;

    return res.status(statusCode).json({
      success: true,
      message:
        result.action === 'existing'
          ? 'Customer already exists in SAP'
          : result.action === 'linked'
            ? 'Customer linked to existing SAP Business Partner'
            : 'Customer successfully synced to SAP',
      businessPartner: result.businessPartner,
      action: result.action,
      customer: {
        id: customer.id,
        customer_code: customerCode,
        customer_name: customer.customer_name,
        sap_card_code: result.sapCardCode || undefined,
      },
    });
  } catch (error) {
    console.error('Error in sync-to-sap API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}
