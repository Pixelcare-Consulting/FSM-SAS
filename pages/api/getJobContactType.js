// pages/api/getJobContactType.js
// Job contact types for the Create/Edit Jobs dropdown.
// PRIMARY source is the Supabase master table job_contact_type_options, so the dropdown
// works even when SAP is unreachable. SAP (sql09/OCLT, ServiceCallTypes) is only used as a
// fallback when the master table is empty, or on demand via ?refresh=1 (with a SAP session)
// which re-syncs SAP into the master table.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { getSupabaseAdmin } from '../../lib/supabase/server';

function mapOcltRows(value) {
  return value.map((item) => ({
    code: item.Code,
    name: item.Name,
  }));
}

function mapServiceCallTypeRows(value) {
  return value.map((item) => ({
    code: item.CallTypeID,
    name: item.Name,
  }));
}

async function fetchSapJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { response, data, text };
}

async function fetchFromSql09(baseUrl, cookies) {
  const queryId = (process.env.SAP_JOB_CONTACT_TYPE_SQL_QUERY_ID || 'sql09').trim();
  const endpoint = `${baseUrl}/SQLQueries('${queryId}')/List`;

  const { response, data } = await fetchSapJson(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `B1SESSION=${cookies.b1session}; ROUTEID=${cookies.routeid}`,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, details: data };
  }

  const value = data?.value;
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, status: response.status, details: data, empty: true };
  }

  return { ok: true, rows: mapOcltRows(value), source: `sql:${queryId}` };
}

async function fetchFromServiceCallTypes(baseUrl, cookies) {
  const endpoint = `${baseUrl}/ServiceCallTypes?$filter=Active eq 'tYES'&$orderby=CallTypeID asc`;

  const { response, data } = await fetchSapJson(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `B1SESSION=${cookies.b1session}; ROUTEID=${cookies.routeid}`,
    },
  });

  if (!response.ok) {
    return { ok: false, status: response.status, details: data };
  }

  const value = data?.value;
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, status: response.status, details: data, empty: true };
  }

  return { ok: true, rows: mapServiceCallTypeRows(value), source: 'ServiceCallTypes' };
}

// PRIMARY: master lookup table seeded from SAP / baseline (scripts/seed-job-lookups.mjs).
// Slim select, no full-table loop (egress guardrails: lookup data, capped).
async function fetchFromOptionsTable() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('job_contact_type_options')
    .select('code,name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(500);

  if (error) throw error;

  return (data || [])
    .filter((row) => String(row.name || '').trim())
    .map((row) => ({ code: row.code, name: String(row.name).trim() }));
}

// Upsert SAP rows into the master table (keyed on code), stamping sap_synced_at.
async function upsertOptionsFromSap(rows) {
  const supabase = getSupabaseAdmin();
  const syncedAt = new Date().toISOString();
  const payload = (rows || [])
    .map((r, idx) => {
      const code = Number(r.code);
      const name = String(r.name || '').trim();
      return Number.isFinite(code) && name
        ? { code, name, is_active: true, sort_order: idx, sap_synced_at: syncedAt }
        : null;
    })
    .filter(Boolean);

  if (!payload.length) return 0;

  const { error } = await supabase
    .from('job_contact_type_options')
    .upsert(payload, { onConflict: 'code' });
  if (error) throw error;
  return payload.length;
}

// LAST RESORT: derive distinct contact types from the per-job job_contact_type table.
async function fetchFromSupabase() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('job_contact_type')
    .select('code,name')
    .not('name', 'is', null)
    .neq('name', '')
    .limit(1000);

  if (error) throw error;

  const deduped = new Map();
  for (const row of data || []) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    const code = row.code != null ? String(row.code).trim() : '';
    const key = `${code}::${name}`;
    if (!deduped.has(key)) deduped.set(key, { code: code || name, name });
  }

  return Array.from(deduped.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

// Pull from SAP (sql09 first, ServiceCallTypes fallback). Returns { rows } or null.
async function pullFromSap(baseUrl, cookies) {
  const primary = await fetchFromSql09(baseUrl, cookies);
  if (primary.ok) return { rows: primary.rows, source: primary.source };

  if (primary.status !== 404 && !primary.empty) {
    console.warn(
      'getJobContactType: sql09/OCLT query failed, trying ServiceCallTypes fallback',
      primary.status,
      primary.details
    );
  }

  const fallback = await fetchFromServiceCallTypes(baseUrl, cookies);
  if (fallback.ok) return { rows: fallback.rows, source: fallback.source };

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { SAP_SERVICE_LAYER_BASE_URL } = process.env;
  const b1session = req.cookies.B1SESSION;
  const routeid = req.cookies.ROUTEID;
  const sessionExpiry = req.cookies.B1SESSION_EXPIRY;
  const hasSapSession = Boolean(b1session && routeid && sessionExpiry);
  const baseUrl = (SAP_SERVICE_LAYER_BASE_URL || '').trim().replace(/\/$/, '');
  const refresh = req.query?.refresh === '1' || req.query?.refresh === 'true';

  try {
    // Optional on-demand SAP re-sync into the master table.
    if (refresh && hasSapSession && baseUrl) {
      try {
        const sap = await pullFromSap(baseUrl, { b1session, routeid });
        if (sap?.rows?.length) {
          await upsertOptionsFromSap(sap.rows);
        }
      } catch (refreshError) {
        console.warn('getJobContactType: ?refresh=1 SAP sync failed', refreshError.message);
      }
    }

    // PRIMARY: master table.
    const options = await fetchFromOptionsTable();
    if (options.length > 0) {
      return res.status(200).json(options);
    }

    // FALLBACK 1: live SAP (only when we have a session) when the master table is empty.
    if (hasSapSession && baseUrl) {
      const sap = await pullFromSap(baseUrl, { b1session, routeid });
      if (sap?.rows?.length) {
        // Backfill the master table so subsequent reads are SAP-independent.
        try {
          await upsertOptionsFromSap(sap.rows);
        } catch (backfillError) {
          console.warn('getJobContactType: backfill upsert failed', backfillError.message);
        }
        return res.status(200).json(sap.rows);
      }
    }

    // LAST RESORT: distinct values from the per-job table.
    const supabaseRows = await fetchFromSupabase();
    if (supabaseRows.length > 0) {
      return res.status(200).json(supabaseRows);
    }

    // Nothing anywhere — return empty list so the dropdown renders without erroring.
    console.warn('getJobContactType: no contact types found in master table, SAP, or per-job table');
    return res.status(200).json([]);
  } catch (error) {
    console.error('Error in getJobContactType API:', error);

    try {
      const supabaseRows = await fetchFromSupabase();
      if (supabaseRows.length > 0) return res.status(200).json(supabaseRows);
    } catch (fallbackError) {
      console.error('getJobContactType: Supabase fallback failed in catch', fallbackError);
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
