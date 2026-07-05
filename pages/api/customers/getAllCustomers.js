// pages/api/customers/getAllCustomers.js
// API endpoint to fetch ALL customers from BusinessPartners (not paginated, for internal use)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;

  let b1session = req.cookies.B1SESSION;
  let routeid = req.cookies.ROUTEID;
  let sessionExpiry = req.cookies.B1SESSION_EXPIRY;

  if (!b1session || !routeid || !sessionExpiry || Date.now() >= new Date(sessionExpiry).getTime()) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  try {
    // Fetch all customers in batches
    const allCustomers = [];
    const batchSize = 1000;
    let skip = 0;
    let hasMore = true;
    let totalCount = 0;

    // Get total count first
    try {
      const countUrl = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners/$count?$filter=CardType eq 'C'`;
      const countResponse = await fetch(countUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
        }
      });
      if (countResponse.ok) {
        totalCount = await countResponse.json();
      }
    } catch (e) {
      console.warn('Could not get total count:', e);
    }

    // Fetch all customers in batches
    while (hasMore) {
      const url = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners?$skip=${skip}&$top=${batchSize}&$filter=CardType eq 'C'&$orderby=CardCode asc&$select=CardCode,CardName,Phone1,EmailAddress`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SAP API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Failed to fetch customers: ${response.status}`);
      }

      const data = await response.json();
      const batchCustomers = data.value || [];
      
      if (batchCustomers.length > 0) {
        allCustomers.push(...batchCustomers);
      }

      if (batchCustomers.length < batchSize) {
        hasMore = false;
      } else {
        skip += batchSize;
      }

      // Safety limit
      if (skip > 50000) {
        console.warn('Reached safety limit of 50k records');
        hasMore = false;
      }
    }

    console.log(`Successfully fetched ${allCustomers.length} customer records`);

    // Return the customers with metadata
    res.status(200).json({
      customers: allCustomers,
      totalCount: totalCount || allCustomers.length,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
}
