process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { fetchLocationsByCardCode } from '../../lib/customers/fetchSapCustomerData';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cardCode } = req.body;
  if (!cardCode) {
    return res.status(400).json({ error: 'CardCode is required' });
  }

  try {
    const { source, locations } = await fetchLocationsByCardCode(cardCode, { req });
    if (locations.length > 0) {
      console.log(`getLocation ${source} (${locations.length}) for`, cardCode);
    }
    return res.status(200).json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
