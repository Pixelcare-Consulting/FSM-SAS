// pages/api/getSalesOrder.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { resolveSapSessionCookies } from '../../lib/customers/fetchSapCustomerData';
import { withSapSessionRetry } from '../../lib/services/sapSessionRetry';

async function fetchSql05SalesOrders(sessionCookies, cardCode, serviceCallID, sapBaseUrl) {
  const { b1session, routeid } = sessionCookies;
  const paramList = `CardCode='${cardCode}'&ServiceCallID='${serviceCallID}'`;
  const requestBody = JSON.stringify({ ParamList: paramList });

  const queryResponse = await fetch(
    `${sapBaseUrl}SQLQueries('sql05')/List`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `B1SESSION=${b1session}; ROUTEID=${routeid}`,
      },
      body: requestBody,
    }
  );

  const responseText = await queryResponse.text();
  if (!queryResponse.ok) {
    const err = new Error(responseText || 'Failed to fetch from SAP');
    err.status = queryResponse.status;
    throw err;
  }

  return JSON.parse(responseText);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  const { cardCode, serviceCallID } = req.body;

  if (!cardCode) {
    return res.status(400).json({ error: 'CardCode is required' });
  }

  const sessionCookies = await resolveSapSessionCookies(req);
  if (!sessionCookies?.b1session || !sessionCookies?.routeid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const queryData = await withSapSessionRetry(sessionCookies, (cookies) =>
      fetchSql05SalesOrders(cookies, cardCode, serviceCallID, SAP_SERVICE_LAYER_BASE_URL)
    );

    return res.status(200).json({
      value: (queryData.value || []).map((item) => ({
        DocNum: item.DocNum,
        DocStatus: item.DocStatus,
        DocTotal: item.DocTotal,
      })),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Error parsing response:', error);
      return res.status(500).json({ error: 'Error parsing SAP response' });
    }

    console.error('Error fetching sales orders:', error);
    const status = Number(error.status) || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({
        error: 'Failed to fetch from SAP',
        details: error.message,
      });
    }
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
}
