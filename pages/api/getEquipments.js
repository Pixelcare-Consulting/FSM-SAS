// api/getEquipments.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { fetchEquipmentsByCardCode } from '../../lib/customers/fetchSapCustomerData';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cardCode } = req.body;
  if (!cardCode) {
    return res.status(400).json({ error: 'CardCode is required' });
  }

  try {
    const { source, equipments } = await fetchEquipmentsByCardCode(cardCode, { req });
    if (equipments.length > 0) {
      console.log(`getEquipments ${source} (${equipments.length}) for`, cardCode);
    }
    return res.status(200).json(equipments);
  } catch (error) {
    console.error('Error fetching equipments:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
