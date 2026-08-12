// pages/api/getQuotations.js
// Customer quotations: SAP Quotations OData (sql12 SQL query was removed from Service Layer).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { resolveSapSessionCookies } from '../../lib/customers/fetchSapCustomerData';

const MAX_NEXTLINK_WALKS = 50;

function escapeODataString(value) {
  return String(value ?? '').replace(/'/g, "''");
}

/** Normalize UI/ISO date strings to YYYY-MM-DD for OData DocDate filters. */
function toODataDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** SAP ISO date → YYYYMMDD (QuotationsTab expects this format). */
function toYyyyMmDd(docDate) {
  if (!docDate) return '';
  const s = String(docDate);
  if (/^\d{8}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${day}`;
}

/** Map SAP DocumentStatus to legacy DocStatus flag used by QuotationsTab. */
function mapDocStatus(documentStatus) {
  const status = String(documentStatus || '').toLowerCase();
  if (status.includes('close')) return 'C';
  return 'O';
}

function mapQuotationRow(item) {
  return {
    CardCode: item.CardCode,
    DocDate: toYyyyMmDd(item.DocDate),
    Comments: item.Comments || '',
    DocNum: item.DocNum,
    DocTotal: item.DocTotal,
    DocStatus: mapDocStatus(item.DocumentStatus),
    subject:
      item.Comments ||
      item.U_SupportRef ||
      item.NumAtCard ||
      '',
  };
}

function buildQuotationsUrl(baseUrl, { filter, select, top, skip }) {
  return (
    `${baseUrl}/Quotations?$filter=${encodeURIComponent(filter)}` +
    `&$select=${select}` +
    `&$orderby=DocNum desc&$top=${top}&$skip=${skip}&$count=true`
  );
}

function resolveNextLink(baseUrl, payload) {
  const raw =
    payload?.['@odata.nextLink'] ||
    payload?.['odata.nextLink'] ||
    payload?.nextLink ||
    null;
  if (!raw || typeof raw !== 'string') return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${baseUrl}${path}`;
}

async function sapGetJson(url, cookies) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Prefer: `odata.maxpagesize=${cookies.maxPageSize}`,
      Cookie: `B1SESSION=${cookies.b1session}; ROUTEID=${cookies.routeid}`,
    },
  });
  const responseText = await response.text();
  if (!response.ok) {
    const err = new Error(responseText || `SAP HTTP ${response.status}`);
    err.status = response.status;
    err.body = responseText;
    throw err;
  }
  return JSON.parse(responseText);
}

/**
 * When $skip returns empty value but count says more rows exist, walk
 * @odata.nextLink from page 1 until the requested window is filled.
 */
async function fetchViaNextLink(baseUrl, { filter, select, skip, limit, cookies }) {
  const firstUrl = buildQuotationsUrl(baseUrl, {
    filter,
    select,
    top: limit,
    skip: 0,
  });

  let payload = await sapGetJson(firstUrl, cookies);
  let collected = Array.isArray(payload.value) ? [...payload.value] : [];
  const totalCount =
    payload['@odata.count'] ??
    payload['odata.count'] ??
    collected.length;

  let walks = 0;
  while (
    collected.length < skip + limit &&
    walks < MAX_NEXTLINK_WALKS
  ) {
    const nextUrl = resolveNextLink(baseUrl, payload);
    if (!nextUrl) break;
    payload = await sapGetJson(nextUrl, cookies);
    const chunk = Array.isArray(payload.value) ? payload.value : [];
    if (chunk.length === 0) break;
    collected = collected.concat(chunk);
    walks += 1;
  }

  return {
    rows: collected.slice(skip, skip + limit),
    totalCount: Number(totalCount) || collected.length,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  const {
    cardCode,
    page: rawPage,
    limit: rawLimit,
    dateFrom: rawDateFrom,
    dateTo: rawDateTo,
  } = req.body;

  if (!cardCode) {
    return res.status(400).json({ error: 'CardCode is required' });
  }

  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(Math.max(1, Number(rawLimit) || 10), 100);
  const skip = (page - 1) * limit;
  const dateFrom = toODataDate(rawDateFrom);
  const dateTo = toODataDate(rawDateTo);

  const sessionCookies = await resolveSapSessionCookies(req);
  if (!sessionCookies?.b1session || !sessionCookies?.routeid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { b1session, routeid } = sessionCookies;
  const cookies = { b1session, routeid, maxPageSize: limit };

  try {
    const baseUrl = (SAP_SERVICE_LAYER_BASE_URL || '').trim().replace(/\/$/, '');
    const safeCardCode = escapeODataString(cardCode.trim());

    const filterParts = [`CardCode eq '${safeCardCode}'`];
    if (dateFrom) {
      filterParts.push(`DocDate ge '${dateFrom}'`);
    }
    if (dateTo) {
      filterParts.push(`DocDate le '${dateTo}'`);
    }
    const filter = filterParts.join(' and ');

    const select = [
      'DocNum',
      'DocDate',
      'DocTotal',
      'DocumentStatus',
      'Comments',
      'CardCode',
      'NumAtCard',
      'U_SupportRef',
    ].join(',');

    const endpoint = buildQuotationsUrl(baseUrl, {
      filter,
      select,
      top: limit,
      skip,
    });

    let queryData;
    try {
      queryData = await sapGetJson(endpoint, cookies);
    } catch (sapErr) {
      console.error('SAP Quotations API Error:', sapErr.status, sapErr.body);
      return res.status(sapErr.status || 502).json({ error: sapErr.body || sapErr.message });
    }

    let rows = Array.isArray(queryData.value) ? queryData.value : [];
    let totalCount =
      queryData['@odata.count'] ??
      queryData['odata.count'] ??
      rows.length;
    totalCount = Number(totalCount) || rows.length;

    // Prefer + $skip sometimes returns empty value while @odata.count is correct.
    if (page > 1 && rows.length === 0 && totalCount > skip) {
      try {
        const walked = await fetchViaNextLink(baseUrl, {
          filter,
          select,
          skip,
          limit,
          cookies,
        });
        rows = walked.rows;
        if (walked.totalCount) {
          totalCount = walked.totalCount;
        }
      } catch (walkErr) {
        console.error('SAP Quotations nextLink fallback Error:', walkErr.status, walkErr.body || walkErr.message);
        return res
          .status(walkErr.status || 502)
          .json({ error: walkErr.body || walkErr.message });
      }
    }

    const quotations = rows.map(mapQuotationRow);

    res.status(200).json({
      quotations,
      totalCount: Number(totalCount) || quotations.length,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
