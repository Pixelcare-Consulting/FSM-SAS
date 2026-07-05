// /api/getCustomerCode.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function norm(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function addressFingerprint(addr) {
  // Ignore AddressName/site label — we want to group by the physical address content.
  // Keep AddressType in the key so bill-to vs ship-to are not merged.
  const type = norm(addr?.AddressType || addr?.AdresType);
  const parts = [
    addr?.Street,
    addr?.BuildingFloorRoom || addr?.Building,
    addr?.Block,
    addr?.Address2,
    addr?.Address3,
    addr?.City,
    addr?.ZipCode,
    addr?.CountryName || addr?.Country,
  ]
    .map(norm)
    .filter(Boolean);

  return `${type}||${parts.join('|')}`;
}

function dedupeBpAddresses(bpAddresses, { shipToDefault, billToDefault } = {}) {
  if (!Array.isArray(bpAddresses) || bpAddresses.length <= 1) return bpAddresses || [];

  const byKey = new Map();

  for (const addr of bpAddresses) {
    const key = addressFingerprint(addr);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, addr);
      continue;
    }

    // Prefer the SAP default address name, then Default='Y', then keep the first.
    const name = String(addr?.AddressName || '').trim();
    const existingName = String(existing?.AddressName || '').trim();
    const isWantedName =
      (shipToDefault && name === shipToDefault) || (billToDefault && name === billToDefault);
    const existingIsWantedName =
      (shipToDefault && existingName === shipToDefault) || (billToDefault && existingName === billToDefault);

    if (existingIsWantedName) continue;
    if (isWantedName) {
      byKey.set(key, addr);
      continue;
    }

    const isDefault = String(addr?.Default || '').toUpperCase() === 'Y';
    const existingDefault = String(existing?.Default || '').toUpperCase() === 'Y';
    if (existingDefault) continue;
    if (isDefault) {
      byKey.set(key, addr);
      continue;
    }
  }

  return [...byKey.values()];
}

export default async function handler(req, res) {
  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  const { cardCode } = req.query;

  let b1session = req.cookies.B1SESSION;
  let routeid = req.cookies.ROUTEID;
  let sessionExpiry = req.cookies.B1SESSION_EXPIRY;

  if (!b1session || !routeid || !sessionExpiry || Date.now() >= new Date(sessionExpiry).getTime()) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  try {
    // Try to fetch with BPAddresses expansion first
    let queryResponse = await fetch(`${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners('${cardCode}')?$expand=BPAddresses,ContactEmployees`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
      }
    });

    // If expansion fails, try without expansion
    if (!queryResponse.ok) {
      console.warn('Failed to fetch with expansion, trying without expansion');
      queryResponse = await fetch(`${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners('${cardCode}')`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
        }
      });
    }

    // Log response status and headers for debugging
    console.log('API Response Status:', queryResponse.status);
    console.log('API Response Headers:', queryResponse.headers);

    if (!queryResponse.ok) {
      const errorData = await queryResponse.text(); // Fetch as text to handle HTML error pages
      console.error('Error response from SAP Service Layer:', errorData);
      return res.status(queryResponse.status).json({ error: `Error fetching BusinessPartner: ${errorData}` });
    }

    const customerData = await queryResponse.json();

    // Ensure the response contains the expected data
    if (!customerData || !customerData.CardCode) {
      console.error('Unexpected response format:', customerData);
      return res.status(500).json({ error: 'Unexpected response format from SAP Service Layer' });
    }

    // If BPAddresses is not expanded, try to fetch addresses separately
    if (!customerData.BPAddresses || customerData.BPAddresses.length === 0) {
      try {
        // Try to fetch addresses using SQL query approach
        const sapService = (await import('../../lib/services/sapService')).default;
        const addresses = await sapService.getBusinessPartnerAddresses(cardCode, { b1session, routeid });
        if (addresses && addresses.length > 0) {
          customerData.BPAddresses = addresses;
        }
      } catch (addressError) {
        console.warn('Could not fetch addresses separately:', addressError.message);
      }
    }

    // De-duplicate BPAddresses by physical address content (prevents repeated rows in Address tab).
    if (Array.isArray(customerData.BPAddresses) && customerData.BPAddresses.length > 1) {
      customerData.BPAddresses = dedupeBpAddresses(customerData.BPAddresses, {
        shipToDefault: customerData.ShipToDefault,
        billToDefault: customerData.BilltoDefault,
      });
    }

    // Return the customer data
    res.status(200).json(customerData);
  } catch (error) {
    console.error('Error fetching BusinessPartner:', error);
    res.status(500).json({ error: 'Internal Server Error: Unable to fetch BusinessPartner' });
  }
}
