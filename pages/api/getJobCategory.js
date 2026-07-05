// pages/api/getJobCategory.js
// Job subjects (categories) for the Create/Edit Jobs dropdown.
// PRIMARY source is the Supabase master table job_subject_options, so the dropdown works
// even when SAP is unreachable. SAP (U_API_JOB_CATEGORY) is only used as a fallback when the
// master table is empty, or on demand via ?refresh=1 (with a SAP session) which re-syncs SAP
// into the master table. Response shape { code, name, U_JobCatID, U_JobCat } is preserved for
// the client mapping in CreateJobs.js.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { getSupabaseAdmin } from '../../lib/supabase/server';

function mapSapRows(value) {
  return value.map((item) => ({
    code: item.Code,
    name: item.Name,
    U_JobCatID: item.U_JobCatID,
    U_JobCat: item.U_JobCat,
  }));
}

// PRIMARY: master lookup table seeded from SAP / baseline (scripts/seed-job-lookups.mjs).
// Slim select, no full-table loop (egress guardrails: lookup data, capped).
async function fetchFromOptionsTable() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('job_subject_options')
    .select('code,name,sap_job_cat_id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(500);

  if (error) throw error;

  return (data || []).map((row) => ({
    code: row.code,
    name: row.name,
    U_JobCatID: row.sap_job_cat_id,
    U_JobCat: row.name,
  }));
}

// Pull subjects from SAP U_API_JOB_CATEGORY. Returns { rows } or null.
async function pullFromSap(baseUrl, b1session, routeid) {
  const endpoint = `${baseUrl}/U_API_JOB_CATEGORY`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `B1SESSION=${b1session}; ROUTEID=${routeid}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn('getJobCategory: SAP U_API_JOB_CATEGORY failed', response.status, errorText);
    return null;
  }

  const data = await response.json();
  const value = data?.value;
  if (!Array.isArray(value) || value.length === 0) return null;

  return { rows: mapSapRows(value) };
}

// Upsert SAP rows into the master table (keyed on sap_job_cat_id), stamping sap_synced_at.
async function upsertOptionsFromSap(rows) {
  const supabase = getSupabaseAdmin();
  const syncedAt = new Date().toISOString();
  const payload = (rows || [])
    .filter((r) => r.U_JobCatID != null && String(r.U_JobCatID).trim() !== '')
    .map((r, idx) => ({
      sap_job_cat_id: String(r.U_JobCatID),
      name: r.U_JobCat != null ? String(r.U_JobCat) : r.name != null ? String(r.name) : null,
      code: r.code != null ? String(r.code) : null,
      is_active: true,
      sort_order: idx,
      sap_synced_at: syncedAt,
    }));

  if (!payload.length) return 0;

  const { error } = await supabase
    .from('job_subject_options')
    .upsert(payload, { onConflict: 'sap_job_cat_id' });
  if (error) throw error;
  return payload.length;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
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
        const sap = await pullFromSap(baseUrl, b1session, routeid);
        if (sap?.rows?.length) {
          await upsertOptionsFromSap(sap.rows);
        }
      } catch (refreshError) {
        console.warn('getJobCategory: ?refresh=1 SAP sync failed', refreshError.message);
      }
    }

    // PRIMARY: master table.
    const options = await fetchFromOptionsTable();
    if (options.length > 0) {
      return res.status(200).json(options);
    }

    // FALLBACK: live SAP (only when we have a session) when the master table is empty.
    if (hasSapSession && baseUrl) {
      const sap = await pullFromSap(baseUrl, b1session, routeid);
      if (sap?.rows?.length) {
        // Backfill the master table so subsequent reads are SAP-independent.
        try {
          await upsertOptionsFromSap(sap.rows);
        } catch (backfillError) {
          console.warn('getJobCategory: backfill upsert failed', backfillError.message);
        }
        return res.status(200).json(sap.rows);
      }
    }

    // Nothing anywhere — return empty list so the dropdown renders without erroring.
    console.warn('getJobCategory: no subjects found in master table or SAP');
    return res.status(200).json([]);
  } catch (error) {
    console.error('Error in getJobCategory API:', error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
