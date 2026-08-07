/**
 * GET /api/customers/duplicates?customerId=|customerCode=
 * Admin: list L/CP/C duplicate candidates for merge preview.
 */

import { requireAdminUser } from '../company-memos/_auth';
import { findCustomerDuplicates } from '../../../lib/customers/mergeCustomers';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : '';
  const customerCode =
    typeof req.query.customerCode === 'string' ? req.query.customerCode.trim() : '';

  if (!customerId && !customerCode) {
    return res.status(400).json({
      success: false,
      error: 'Provide customerId or customerCode',
    });
  }

  try {
    const result = await findCustomerDuplicates(auth.admin, {
      customerId: customerId || null,
      customerCode: customerCode || null,
    });

    if (!result.seed) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      success: true,
      seed: result.seed,
      candidates: result.candidates,
      recommendedSurvivorId: result.recommendedSurvivorId,
    });
  } catch (err) {
    console.error('[customers/duplicates]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to find duplicates',
    });
  }
}
