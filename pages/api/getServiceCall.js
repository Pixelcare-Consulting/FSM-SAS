process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { fetchServiceCallsByCardCode } from '../../lib/customers/fetchSapCustomerData';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cardCode } = req.body;
  if (!cardCode || typeof cardCode !== 'string' || cardCode.trim().length === 0) {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'CardCode is required and must be a non-empty string',
    });
  }

  try {
    const { source, serviceCalls } = await fetchServiceCallsByCardCode(cardCode, { req });
    if (serviceCalls.length > 0) {
      console.log(`getServiceCall ${source} (${serviceCalls.length}) for`, cardCode);
    }
    return res.status(200).json(serviceCalls);
  } catch (error) {
    console.error('Error fetching service calls:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  }
}
