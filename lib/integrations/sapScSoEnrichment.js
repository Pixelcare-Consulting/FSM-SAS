/**
 * Enrich Supabase service_call / sales_order from SAP SQLQueries sql10 / sql05.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from '../services/sapService.js';

function pickSapField(row, ...keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    const val = row[key];
    if (val != null && String(val).trim() !== '') return val;
  }
  return '';
}

function isSapNoRecordsResponse(status, responseText) {
  if (status !== 404) return false;
  return /No matching records found|-2028/i.test(String(responseText || ''));
}

function escSapParam(value) {
  return String(value ?? '').trim().replace(/'/g, "''");
}

/**
 * POST /b1s/v1/SQLQueries('{queryId}')/List
 * @param {string} queryId
 * @param {string} paramList - e.g. CardCode='C001' or CardCode='C001'&ServiceCallID='15050'
 * @param {Object} sessionCookies
 */
export async function runSapSqlList(queryId, paramList, sessionCookies) {
  const base = (process.env.SAP_SERVICE_LAYER_BASE_URL || '').trim().replace(/\/?$/, '/');
  if (!base) throw new Error('SAP_SERVICE_LAYER_BASE_URL is not set');
  if (!sessionCookies?.b1session || !sessionCookies?.routeid) {
    throw new Error('SAP session cookies required');
  }

  const res = await fetch(`${base}SQLQueries('${queryId}')/List`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `B1SESSION=${sessionCookies.b1session}; ROUTEID=${sessionCookies.routeid}`,
    },
    body: JSON.stringify({ ParamList: paramList }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (isSapNoRecordsResponse(res.status, text)) return [];
    throw new Error(text || `SAP ${queryId} failed (${res.status})`);
  }

  const data = JSON.parse(text || '{}');
  return Array.isArray(data?.value) ? data.value : [];
}

export async function resolveSapSessionForScript() {
  const login = await loginSessionCookiesFromEnvironment();
  return unwrapSapEnvironmentLogin(login);
}

/** @param {string|number} raw - SAP CreateDate YYYYMMDD */
export function parseSapCreateDate(raw) {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (s.length !== 8) return null;
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(`${y}-${m}-${d}`)) return null;
  return `${y}-${m}-${d}`;
}

/** @param {string|number} raw - SAP CreateTime HHmm */
export function formatSapCreateTime(raw) {
  const n = parseInt(String(raw ?? '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  const s = String(n).padStart(4, '0').slice(-4);
  return s;
}

/**
 * sql10 row → normalized object
 */
export function mapSql10ServiceCallRow(item) {
  const rawId = pickSapField(item, 'ServiceCallID', "'ServiceCallID'", 'CallID');
  const parsedId = parseInt(String(rawId).replace(/'/g, ''), 10);
  return {
    serviceCallId: Number.isFinite(parsedId) ? String(parsedId) : String(rawId).trim(),
    subject: pickSapField(item, 'Subject', "'Subject'"),
    customerName: pickSapField(item, 'CustomerName', "'CustomerName'"),
    createDate: pickSapField(item, 'CreateDate', "'CreateDate'"),
    createTime: pickSapField(item, 'CreateTime', "'CreateTime'"),
    description: pickSapField(item, 'Description', "'Description'"),
  };
}

/**
 * sql05 row → normalized object
 */
export function mapSql05SalesOrderRow(item) {
  const docNumRaw = pickSapField(item, 'DocNum', "'DocNum'");
  const docNum = docNumRaw != null && docNumRaw !== '' ? String(docNumRaw).trim() : null;
  const totalRaw = item?.DocTotal ?? item?.["'DocTotal'"];
  const total = totalRaw != null && totalRaw !== '' ? Number(totalRaw) : null;
  return {
    docNum,
    docStatus: pickSapField(item, 'DocStatus', "'DocStatus'"),
    docTotal: Number.isFinite(total) ? total : null,
  };
}

export function buildSql10ParamList(cardCode) {
  return `CardCode='${escSapParam(cardCode)}'`;
}

export function buildSql05ParamList(cardCode, serviceCallId) {
  return `CardCode='${escSapParam(cardCode)}'&ServiceCallID='${escSapParam(serviceCallId)}'`;
}

/**
 * Fetch open service calls for customer (sql10).
 */
export async function fetchSapServiceCallsSql10(cardCode, sessionCookies) {
  const rows = await runSapSqlList('sql10', buildSql10ParamList(cardCode), sessionCookies);
  return rows.map(mapSql10ServiceCallRow).filter((r) => r.serviceCallId);
}

/**
 * Fetch sales orders linked to service call (sql05).
 */
export async function fetchSapSalesOrdersSql05(cardCode, serviceCallId, sessionCookies) {
  const rows = await runSapSqlList(
    'sql05',
    buildSql05ParamList(cardCode, serviceCallId),
    sessionCookies
  );
  return rows.map(mapSql05SalesOrderRow).filter((r) => r.docNum);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} serviceCallUuid
 * @param {ReturnType<typeof mapSql10ServiceCallRow>} sapRow
 */
export async function applySql10ToServiceCall(supabase, serviceCallUuid, sapRow) {
  const now = new Date().toISOString();
  const patch = {
    sap_synced_at: now,
    updated_at: now,
  };

  if (sapRow.subject) patch.subject = String(sapRow.subject).slice(0, 255);
  if (sapRow.customerName) patch.customer_name_sap = String(sapRow.customerName).slice(0, 255);
  const sapDate = parseSapCreateDate(sapRow.createDate);
  if (sapDate) patch.sap_create_date = sapDate;
  const sapTime = formatSapCreateTime(sapRow.createTime);
  if (sapTime) patch.sap_create_time = sapTime;
  if (sapRow.description != null && String(sapRow.description).trim() !== '') {
    patch.description = String(sapRow.description);
  }

  const { error } = await supabase.from('service_call').update(patch).eq('id', serviceCallUuid);
  if (error) throw error;
  return patch;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} salesOrderUuid
 * @param {ReturnType<typeof mapSql05SalesOrderRow>|null} sapRow
 */
export async function applySql05ToSalesOrder(supabase, salesOrderUuid, sapRow) {
  const now = new Date().toISOString();
  const patch = {
    sap_synced_at: now,
    sap_found: Boolean(sapRow),
    updated_at: now,
  };

  if (sapRow) {
    if (sapRow.docStatus) patch.document_status = String(sapRow.docStatus);
    if (sapRow.docTotal != null) patch.document_total = sapRow.docTotal;
  }

  const { error } = await supabase.from('sales_order').update(patch).eq('id', salesOrderUuid);
  if (error) throw error;
  return patch;
}
