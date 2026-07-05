/* eslint-disable no-console */
/**
 * Probe AIFM customer lookup endpoints using an `id_customer` from the jobs API.
 *
 * Usage:
 *   node scripts/test-aifm-customer-fetch.js
 *   node scripts/test-aifm-customer-fetch.js --start=2026-04-01 --end=2026-04-30
 *   node scripts/test-aifm-customer-fetch.js --customer-id=12345
 *   node scripts/test-aifm-customer-fetch.js --job-id=218376
 *
 * Purpose:
 *   1. Authorize with AIFM.
 *   2. Fetch one jobs page unless `--customer-id` is provided.
 *   3. Pick a target `id_customer`.
 *   4. Probe candidate customer endpoints, including `/api/v1/customers`.
 *   5. Print compact JSON so we can decide whether the main flow should enrich
 *      customer/company details from the customer API instead of trusting the job row.
 */

try {
  require("dotenv").config({ path: ".env.local" });
} catch (_) {
  // dotenv is optional in this repo
}

const DEFAULT_BASE = "https://apacapiopen.aifieldmanagement.com";
const AUTH_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 20000;

function normalizeBase(url) {
  const t = String(url || DEFAULT_BASE).trim().replace(/\/+$/, "");
  return t || DEFAULT_BASE;
}

function dateFmt(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  return { start: dateFmt(start), end: dateFmt(end) };
}

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) {
      out[raw.slice(2)] = true;
    } else {
      out[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return out;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function compact(value, maxLen = 1600) {
  const s = JSON.stringify(value, null, 2);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}\n... <truncated>`;
}

function summarizeCustomerProbe(payload, targetCustomerId) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const matches = rows.filter((row) => String(row?.id) === String(targetCustomerId));
  return {
    rowCount: rows.length,
    exactMatchCount: matches.length,
    exactMatch: matches[0] || null,
    firstRow: rows[0] || null,
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url, body, bearer, timeoutMs = REQUEST_TIMEOUT_MS) {
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  const text = await res.text();
  const json = safeJsonParse(text);
  return {
    ok: res.ok,
    status: res.status,
    url,
    body,
    json,
    text: json ? null : text.slice(0, 1200),
  };
}

async function authorize(base, apiToken) {
  for (const body of [{ secret: apiToken }, { api_token: apiToken }]) {
    try {
      const result = await postJson(`${base}/api/v1/authorize`, body, null, AUTH_TIMEOUT_MS);
      if (Number(result.json?.code) === 200 && result.json?.data?.token) {
        return {
          bearer: result.json.data.token,
          raw: result.json,
          requestBody: body,
        };
      }
    } catch (_) {
      // Try the next known auth shape
    }
  }
  return null;
}

async function fetchJobsPage(base, bearer, startDate, endDate) {
  const bodyVariants = [
    { api_token: bearer, start_date: startDate, end_date: endDate, page: 1, per_page: 50 },
    { api_token: bearer, start_date: startDate, end_date: endDate, page: 1, limit: 50 },
    { api_token: bearer, start_date: startDate, end_date: endDate },
  ];

  for (const body of bodyVariants) {
    const result = await postJson(`${base}/api/v1/jobs`, body, bearer);
    if (Number(result.json?.code) === 200 && Array.isArray(result.json?.data)) {
      return { ...result, requestBody: body };
    }
  }
  return null;
}

function pickTargetJob(jobs, args) {
  if (!Array.isArray(jobs) || jobs.length === 0) return null;

  if (args["job-id"]) {
    return jobs.find((job) => String(job?.id) === String(args["job-id"])) || null;
  }

  const withCustomer = jobs.find((job) => job?.id_customer != null);
  return withCustomer || jobs[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiToken = String(process.env.AIFM_API_TOKEN || "").trim().replace(/^["']|["']$/g, "");
  const base = normalizeBase(process.env.AIFM_BASE_URL);
  const range = defaultRange();
  const startDate = String(args.start || range.start);
  const endDate = String(args.end || range.end);

  if (!apiToken) {
    console.error("Missing AIFM_API_TOKEN in environment or .env.local");
    process.exit(1);
  }

  console.log("=== AIFM Customer Fetch Probe ===");
  console.log("Base URL:", base);
  console.log("Date range:", `${startDate} -> ${endDate}`);
  console.log("Target customer override:", args["customer-id"] || "(none)");
  console.log("Target job override:", args["job-id"] || "(none)");

  const auth = await authorize(base, apiToken);
  if (!auth) {
    console.error("\nAuthorization failed.");
    process.exit(1);
  }

  console.log("\nAuthorization succeeded.");
  console.log("Authorize request body:", JSON.stringify(auth.requestBody));

  let targetCustomerId = args["customer-id"] != null ? String(args["customer-id"]) : null;
  let targetJob = null;
  let jobsResult = null;

  if (!targetCustomerId) {
    jobsResult = await fetchJobsPage(base, auth.bearer, startDate, endDate);
    if (!jobsResult) {
      console.error("\nFailed to fetch jobs.");
      process.exit(1);
    }

    const jobs = jobsResult.json.data || [];
    console.log("\nJobs fetch succeeded.");
    console.log("Jobs request body:", JSON.stringify(jobsResult.requestBody));
    console.log("Jobs returned:", jobs.length);

    targetJob = pickTargetJob(jobs, args);
    if (!targetJob) {
      console.error("No target job found in returned jobs.");
      process.exit(1);
    }

    targetCustomerId =
      targetJob.id_customer != null ? String(targetJob.id_customer) : null;

    console.log("\nSelected job summary:");
    console.log(
      compact({
        id: targetJob.id,
        id_customer: targetJob.id_customer,
        customer_name: targetJob.customer_name,
        customer_firstName: targetJob.customer_firstName,
        customer_lastName: targetJob.customer_lastName,
        customer_service_location_id: targetJob.customer_service_location_id,
        personal_job_id: targetJob.personal_job_id,
        job_po_number: targetJob.job_po_number,
      })
    );
  }

  if (!targetCustomerId) {
    console.error("\nTarget job had no id_customer. Pass --customer-id=... or widen the date range.");
    process.exit(1);
  }

  const probes = [
    {
      label: "customers by customer_id",
      path: "/api/v1/customers",
      body: { api_token: auth.bearer, customer_id: targetCustomerId },
    },
    {
      label: "customers by id_customer",
      path: "/api/v1/customers",
      body: { api_token: auth.bearer, id_customer: targetCustomerId },
    },
    {
      label: "service locations by customer_id",
      path: "/api/v1/customers/service_locations",
      body: { api_token: auth.bearer, customer_id: targetCustomerId },
    },
    {
      label: "equipments by customer_id",
      path: "/api/v1/customers/equipments",
      body: { api_token: auth.bearer, customer_id: targetCustomerId },
    },
  ];

  console.log(`\nTarget customer id: ${targetCustomerId}`);

  for (const probe of probes) {
    try {
      const result = await postJson(`${base}${probe.path}`, probe.body, auth.bearer);
      console.log(`\n--- ${probe.label} ---`);
      console.log("Status:", result.status);
      console.log("Request body:", JSON.stringify(probe.body));
      if (result.json) {
        if (probe.path === "/api/v1/customers") {
          console.log("Summary:", compact(summarizeCustomerProbe(result.json, targetCustomerId), 800));
        }
        console.log(compact(result.json));
      } else {
        console.log(result.text || "(no body)");
      }
    } catch (error) {
      console.log(`\n--- ${probe.label} ---`);
      console.log("Error:", error.message);
    }
  }
}

main().catch((error) => {
  console.error("\nProbe failed:", error);
  process.exit(1);
});
