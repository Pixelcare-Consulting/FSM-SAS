// pages/api/getCustomers.js
// SAP customers for dropdowns: uses BusinessPartners OData so CardCode/CardName are always present.
// (sql01 is a configurable query and may not return those column names — that caused "undefined - undefined" labels.)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export default async function handler(req, res) {
  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  const b1session = req.cookies.B1SESSION;
  const routeid = req.cookies.ROUTEID;

  if (!b1session || !routeid) {
    return res.status(401).json({ error: 'Unauthorized: Session is missing or expired' });
  }

  try {
    const allRows = [];
    const batchSize = 1000;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const url = `${SAP_SERVICE_LAYER_BASE_URL}BusinessPartners?$skip=${skip}&$top=${batchSize}&$filter=CardType eq 'C'&$orderby=CardCode asc&$select=CardCode,CardName`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `B1SESSION=${b1session}; ROUTEID=${routeid}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('SAP BusinessPartners error:', response.status, errorData);
        return res.status(response.status).json({ error: `Error fetching customers: ${errorData}` });
      }

      const data = await response.json();
      const batch = Array.isArray(data.value) ? data.value : [];

      for (const item of batch) {
        const cardCode = item.CardCode ?? item.cardCode;
        const cardName = item.CardName ?? item.cardName;
        if (cardCode != null && String(cardCode).trim() !== '') {
          allRows.push({
            cardCode: String(cardCode).trim(),
            cardName: cardName != null ? String(cardName).trim() : '',
          });
        }
      }

      if (batch.length < batchSize) {
        hasMore = false;
      } else {
        skip += batchSize;
      }

      if (skip > 50000) {
        console.warn('getCustomers: reached safety cap of 50k rows');
        hasMore = false;
      }
    }

    console.log('getCustomers (OData):', { count: allRows.length, first: allRows[0] });

    res.status(200).json(allRows);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Internal Server Error: Unable to fetch customers' });
  }
}
