// pages/api/customers/getAllAddresses.js
// API endpoint to fetch all addresses for all Business Partners using SQL Query 14
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
    // Call SQL Query 14 to get all addresses for all BPs
    const url = `${SAP_SERVICE_LAYER_BASE_URL}SQLQueries('sql14')/List`;

    console.log('Fetching all addresses from SQL Query 14:', url);

    const queryResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`
      }
    });

    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      console.error('SAP API Error:', {
        status: queryResponse.status,
        statusText: queryResponse.statusText,
        body: errorText
      });
      return res.status(queryResponse.status).json({ 
        error: 'Failed to fetch addresses from SAP',
        details: errorText
      });
    }

    const responseText = await queryResponse.text();
    console.log('Raw API Response length:', responseText.length);

    let queryData;
    try {
      queryData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse SAP response:', parseError);
      return res.status(500).json({ 
        error: 'Invalid response format',
        message: 'Failed to parse SAP response as JSON'
      });
    }

    // Extract the value array from the response
    const addresses = queryData.value || [];

    console.log(`Successfully fetched ${addresses.length} address records`);

    // Return the addresses with metadata
    res.status(200).json({
      addresses: addresses,
      totalCount: addresses.length,
      meta: {
        queryId: 'sql14',
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
}

