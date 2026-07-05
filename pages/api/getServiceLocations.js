// pages/api/getServiceLocations.js

import { fetchServiceLocationsByCardCode } from '../../lib/services/fetchServiceLocationsByCardCode';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let b1session = req.cookies.B1SESSION;
  let routeid = req.cookies.ROUTEID;
  let sessionExpiry = req.cookies.B1SESSION_EXPIRY;

  if (!b1session || !routeid || !sessionExpiry || Date.now() >= new Date(sessionExpiry).getTime()) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  try {
    // When cardCode is provided, fetch locations for that BP only (used by migration, etc.)
    const cardCode = (req.query.cardCode || '').toString().trim();
    if (cardCode) {
      const locations = await fetchServiceLocationsByCardCode(cardCode, { b1session, routeid });
      return res.status(200).json({
        locations,
        totalCount: locations.length,
        page: 1,
        limit: locations.length,
      });
    }

    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Modified SQL query to handle the search term better
    const sqlQuery = `
      SELECT TOP ${parseInt(limit)}
        T2.[CardName] AS [CustomerName],
        T2.[E_Mail] AS [EmailAddress],
        T2.[Phone1],
        T2.[Phone2],
        T0.[Address] AS [Address1],
        T0.[Address2],
        T0.[Address3],
        T0.[ZipCode] AS [PostalCode],
        T1.[Name] AS [Country]
      FROM [CRD1] T0 
      INNER JOIN [OCRY] T1 ON T0.[Country] = T1.[Code]
      INNER JOIN [OCRD] T2 ON T0.[CardCode] = T2.[CardCode]
      WHERE T0.[AdresType] = 'S'
      AND T2.[CardType] = 'C'
      AND T2.[frozenFor] = 'N'
      ${req.query.address ? `AND (
        T0.[Address] LIKE '%${req.query.address}%' OR
        T0.[Address2] LIKE '%${req.query.address}%' OR
        T0.[Address3] LIKE '%${req.query.address}%'
      )` : ''}
      ${req.query.customerName ? `AND T2.[CardName] LIKE '%${req.query.customerName}%'` : ''}
      AND T2.[CardName] NOT IN (
        SELECT TOP ${offset} T2.[CardName]
        FROM [CRD1] T0 
        INNER JOIN [OCRD] T2 ON T0.[CardCode] = T2.[CardCode]
        WHERE T0.[AdresType] = 'S'
        AND T2.[CardType] = 'C'
        AND T2.[frozenFor] = 'N'
        ${req.query.address ? `AND (
          T0.[Address] LIKE '%${req.query.address}%' OR
          T0.[Address2] LIKE '%${req.query.address}%' OR
          T0.[Address3] LIKE '%${req.query.address}%'
        )` : ''}
        ${req.query.customerName ? `AND T2.[CardName] LIKE '%${req.query.customerName}%'` : ''}
        ORDER BY T2.[CardName]
      )
      ORDER BY T2.[CardName];

      SELECT COUNT(*) as total
      FROM [CRD1] T0 
      INNER JOIN [OCRD] T2 ON T0.[CardCode] = T2.[CardCode]
      WHERE T0.[AdresType] = 'S'
      AND T2.[CardType] = 'C'
      AND T2.[frozenFor] = 'N'
      ${req.query.address ? `AND (
        T0.[Address] LIKE '%${req.query.address}%' OR
        T0.[Address2] LIKE '%${req.query.address}%' OR
        T0.[Address3] LIKE '%${req.query.address}%'
      )` : ''}
      ${req.query.customerName ? `AND T2.[CardName] LIKE '%${req.query.customerName}%'` : ''}
    `;

    console.log('Executing SQL Query:', sqlQuery);

    const baseUrl = process.env.SAP_SERVICE_LAYER_BASE_URL;
    const url = `${baseUrl}/SQLQueries('sql13')/List`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Cookie': `B1SESSION=${b1session}; ROUTEID=${routeid}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        SqlText: sqlQuery
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SAP B1 API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`SAP B1 API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Raw API Response:', data);

    // Extract results from the correct data structure
    const locations = Array.isArray(data.value) && data.value.length > 0 ? data.value : [];
    const totalCount = locations.length > 0 ? locations.length : 0;

    console.log('Processed Data:', {
      receivedRecords: locations.length,
      totalCount: totalCount,
      page: page,
      limit: limit
    });

    return res.status(200).json({
      locations: locations,
      totalCount: totalCount,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch locations',
      details: error.message 
    });
  }
}