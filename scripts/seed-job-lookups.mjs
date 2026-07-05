/**
 * Seed the Create/Edit Jobs master lookup tables so the Contact Type and Subject
 * dropdowns are never empty — even when SAP is unreachable.
 *
 * Tables seeded (idempotent upserts):
 *   - job_contact_type_options  (onConflict: code)            <- SAP OCLT / sql09
 *   - job_subject_options       (onConflict: sap_job_cat_id)  <- SAP U_API_JOB_CATEGORY
 *
 * Behaviour:
 *   1. ALWAYS upserts a hardcoded baseline (at minimum Service=3 contact type and one
 *      subject) so the dropdowns work out of the box.
 *   2. If SAP env credentials are present (SAP_SERVICE_LAYER_BASE_URL + SAP_B1_*), it logs
 *      in with the same env-login helper the cron jobs use, pulls live OCLT + job categories,
 *      and upserts them with sap_synced_at. If SAP is down or env is missing, it silently
 *      skips the SAP block and keeps the baseline — the script never fails because of SAP.
 *
 * Usage (repo root):
 *   pnpm node scripts/seed-job-lookups.mjs            # baseline (+ SAP if reachable)
 *   pnpm node scripts/seed-job-lookups.mjs --no-sap   # baseline only, skip SAP entirely
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getPortalDefaultJobContactType } from "../lib/jobs/portalDefaultJobContactType.js";
import {
  loginSessionCookiesFromEnvironment,
  unwrapSapEnvironmentLogin,
} from "../lib/services/sapService.js";

// SAP Service Layer uses a self-signed cert in most deployments.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

const SKIP_SAP = process.argv.includes("--no-sap");

function logHeader(title) {
  console.log(`\n=== ${title} ===`);
}

/** Baseline contact types. Service=3 is the portal default (SAP OCLT). */
function buildBaselineContactTypes() {
  const { code, name } = getPortalDefaultJobContactType(); // { code: 3, name: 'Service' }
  return [{ code, name, is_active: true, sort_order: 0 }];
}

/** Baseline subject so the dropdown is never empty before the first SAP sync. */
function buildBaselineSubjects() {
  return [
    {
      sap_job_cat_id: "GENERAL",
      name: "General",
      code: "GENERAL",
      is_active: true,
      sort_order: 0,
    },
  ];
}

async function upsertContactTypes(supabase, rows, { synced } = {}) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    code: r.code,
    name: r.name,
    is_active: r.is_active ?? true,
    sort_order: r.sort_order ?? 0,
    ...(synced ? { sap_synced_at: new Date().toISOString() } : {}),
  }));
  const { error } = await supabase
    .from("job_contact_type_options")
    .upsert(payload, { onConflict: "code" });
  if (error) throw new Error(`job_contact_type_options upsert: ${error.message}`);
  return payload.length;
}

async function upsertSubjects(supabase, rows, { synced } = {}) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    sap_job_cat_id: r.sap_job_cat_id,
    name: r.name,
    code: r.code,
    is_active: r.is_active ?? true,
    sort_order: r.sort_order ?? 0,
    ...(synced ? { sap_synced_at: new Date().toISOString() } : {}),
  }));
  const { error } = await supabase
    .from("job_subject_options")
    .upsert(payload, { onConflict: "sap_job_cat_id" });
  if (error) throw new Error(`job_subject_options upsert: ${error.message}`);
  return payload.length;
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
  return { response, data };
}

/** Pull OCLT contact types from SAP sql09. Returns [] on any failure (best-effort). */
async function pullSapContactTypes(baseUrl, cookies) {
  const queryId = (process.env.SAP_JOB_CONTACT_TYPE_SQL_QUERY_ID || "sql09").trim();
  const endpoint = `${baseUrl}/SQLQueries('${queryId}')/List`;
  const { response, data } = await fetchSapJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `B1SESSION=${cookies.b1session}; ROUTEID=${cookies.routeid}`,
    },
    body: JSON.stringify({}),
  });
  if (!response.ok || !Array.isArray(data?.value)) return [];
  return data.value
    .filter((item) => item?.Name)
    .map((item, idx) => ({
      code: Number(item.Code),
      name: String(item.Name).trim(),
      is_active: true,
      sort_order: idx,
    }))
    .filter((r) => Number.isFinite(r.code) && r.name);
}

/** Pull job categories (subjects) from SAP U_API_JOB_CATEGORY. Returns [] on failure. */
async function pullSapSubjects(baseUrl, cookies) {
  const endpoint = `${baseUrl}/U_API_JOB_CATEGORY`;
  const { response, data } = await fetchSapJson(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: `B1SESSION=${cookies.b1session}; ROUTEID=${cookies.routeid}`,
    },
  });
  if (!response.ok || !Array.isArray(data?.value)) return [];
  return data.value
    .filter((item) => item?.U_JobCatID != null)
    .map((item, idx) => ({
      sap_job_cat_id: String(item.U_JobCatID),
      name: item.U_JobCat != null ? String(item.U_JobCat) : null,
      code: item.Code != null ? String(item.Code) : null,
      is_active: true,
      sort_order: idx,
    }))
    .filter((r) => r.sap_job_cat_id);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  // Standalone scripts must read env AFTER dotenv.config(), so we build the admin client
  // here directly (same pattern as scripts/repair-job-7029-location.mjs) rather than via
  // lib/supabase/server.js getSupabaseAdmin, whose env is captured at import time.
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- 1. Always seed the hardcoded baseline ---
  logHeader("Baseline upsert");
  const baseCt = await upsertContactTypes(supabase, buildBaselineContactTypes());
  const baseSub = await upsertSubjects(supabase, buildBaselineSubjects());
  console.log(`Contact types: ${baseCt} baseline row(s) upserted.`);
  console.log(`Subjects: ${baseSub} baseline row(s) upserted.`);

  // --- 2. Best-effort SAP sync (skipped on --no-sap, missing env, or SAP down) ---
  if (SKIP_SAP) {
    console.log("\nSAP sync skipped (--no-sap).");
  } else {
    logHeader("SAP sync (best-effort)");
    const baseUrl = (process.env.SAP_SERVICE_LAYER_BASE_URL || "")
      .trim()
      .replace(/\/$/, "");
    if (!baseUrl) {
      console.log("SAP_SERVICE_LAYER_BASE_URL not set — keeping baseline only.");
    } else {
      const loginResult = await loginSessionCookiesFromEnvironment();
      const cookies = unwrapSapEnvironmentLogin(loginResult);
      if (!cookies) {
        console.log(
          `SAP login unavailable (${loginResult?.error || "no session"}) — keeping baseline only.`
        );
      } else {
        try {
          const sapCt = await pullSapContactTypes(baseUrl, cookies);
          const nCt = await upsertContactTypes(supabase, sapCt, { synced: true });
          console.log(`Contact types: ${nCt} row(s) synced from SAP OCLT.`);
        } catch (e) {
          console.warn("SAP contact-type sync failed:", e.message);
        }
        try {
          const sapSub = await pullSapSubjects(baseUrl, cookies);
          const nSub = await upsertSubjects(supabase, sapSub, { synced: true });
          console.log(`Subjects: ${nSub} row(s) synced from SAP U_API_JOB_CATEGORY.`);
        } catch (e) {
          console.warn("SAP subject sync failed:", e.message);
        }
      }
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
