// pages/api/searchServiceCalls.js
// Text search of open SAP service calls across all customers (Create Job:
// pick a service call directly; the form then switches to its customer).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { resolveSapSessionCookies } from '../../lib/customers/fetchSapCustomerData';
import { withSapSessionRetry } from '../../lib/services/sapSessionRetry';

const MIN_CHARS = 2;
const RESULT_LIMIT = 20;
// OSCS "Open" — same status sql10 lists for the per-customer dropdown.
const SAP_SERVICE_CALL_STATUS_OPEN = -3;

function escapeODataLiteral(value) {
  return String(value).replace(/'/g, "''");
}

/** Every word must match number, subject, customer name/code or description. */
function buildServiceCallSearchFilter(term) {
  const tokens = String(term || '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const tokenFilters = tokens.map((token) => {
    const lit = escapeODataLiteral(token);
    const parts = [
      `contains(Subject,'${lit}')`,
      `contains(CustomerName,'${lit}')`,
      `contains(CustomerCode,'${lit}')`,
      `contains(Description,'${lit}')`,
    ];
    if (/^\d{1,9}$/.test(token)) parts.push(`ServiceCallID eq ${token}`);
    return `(${parts.join(' or ')})`;
  });
  return [`Status eq ${SAP_SERVICE_CALL_STATUS_OPEN}`, ...tokenFilters].join(' and ');
}

async function fetchServiceCallSearch(sessionCookies, term, sapBaseUrl) {
  const { b1session, routeid } = sessionCookies;
  const params = [
    `$filter=${encodeURIComponent(buildServiceCallSearchFilter(term))}`,
    '$select=ServiceCallID,Subject,CustomerCode,CustomerName,Description,CreationDate,CreationTime',
    '$orderby=ServiceCallID desc',
    `$top=${RESULT_LIMIT}`,
  ].join('&');

  const response = await fetch(`${sapBaseUrl}ServiceCalls?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `B1SESSION=${b1session}; ROUTEID=${routeid}`,
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    const err = new Error(responseText || 'Failed to search SAP service calls');
    err.status = response.status;
    throw err;
  }

  const data = JSON.parse(responseText || '{}');
  return Array.isArray(data?.value) ? data.value : [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  const term = String(req.body?.q || '').trim();
  if (term.length < MIN_CHARS) {
    return res.status(200).json([]);
  }

  const sessionCookies = await resolveSapSessionCookies(req);
  if (!sessionCookies?.b1session || !sessionCookies?.routeid) {
    return res.status(401).json({ error: 'SAP session unavailable', sessionMissing: true });
  }

  try {
    const rows = await withSapSessionRetry(sessionCookies, (cookies) =>
      fetchServiceCallSearch(cookies, term, SAP_SERVICE_LAYER_BASE_URL)
    );

    return res.status(200).json(
      rows
        .filter((row) => row?.ServiceCallID != null && row?.CustomerCode)
        .map((row) => ({
          serviceCallID: row.ServiceCallID,
          subject: String(row.Subject || '').trim(),
          customerCode: String(row.CustomerCode).trim(),
          customerName: String(row.CustomerName || '').trim(),
          description: String(row.Description || '').trim(),
          createDate: row.CreationDate || '',
          createTime: row.CreationTime || '',
        }))
    );
  } catch (error) {
    console.error('Error searching service calls:', error);
    const status = Number(error.status) || 500;
    return res.status(status >= 400 && status < 500 ? status : 500).json({
      error: 'Failed to search SAP service calls',
      details: error.message,
    });
  }
}
