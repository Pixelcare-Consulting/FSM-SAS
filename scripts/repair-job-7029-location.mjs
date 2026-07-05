/**
 * One-off, idempotent repair for the corrupted Service Location of job 2026-007029
 * (customer CP00127, SAMUEL LEE).
 *
 * The job's location was corrupted to the bare site label `11-#09-30` after a second
 * edit. Sibling jobs 2026-007026/027/028 still hold the full composite address
 * `11 DAIRY FARM WALK, #09-30 THE BOTANY, 679629, 11-#09-30`.
 *
 * This script is STRICTLY scoped to CP00127 / job 2026-007029's location. It investigates
 * first (always prints), then only writes when run with `--apply`. It uses a
 * "prefer the richer value" merge so it never blanks or shortens existing data.
 *
 * Usage (repo root):
 *   pnpm node scripts/repair-job-7029-location.mjs           # dry-run (investigate only)
 *   pnpm node scripts/repair-job-7029-location.mjs --apply   # apply the scoped repair
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  buildLeadLocationName,
  getCustomerAddressFromLead,
} from "../lib/utils/leadLocationName.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

const TARGET_CUSTOMER_CODE = "CP00127";
const TARGET_JOB_NUMBER = "2026-007029";
const SIBLING_JOB_NUMBER = "2026-007026";
const EXPECTED_FULL_ADDRESS =
  "11 DAIRY FARM WALK, #09-30 THE BOTANY, 679629, 11-#09-30";

const APPLY = process.argv.includes("--apply");

// Columns we may restore on the locations row (the bare-label corruption target).
const LOCATION_RESTORE_FIELDS = [
  "location_name",
  "street",
  "address",
  "building",
  "block",
  "city",
  "zip_code",
];

// Columns we may restore on customer_location rows.
const CUSTOMER_LOCATION_RESTORE_FIELDS = [
  "address",
  "street",
  "building",
  "block",
  "street_number",
  "city",
  "zip_code",
];

function trimmed(value) {
  return String(value == null ? "" : value).trim();
}

/** A value is a "bare site label" if it is empty or equals the site id (e.g. `11-#09-30`). */
function isBareSiteLabel(value, siteId) {
  const v = trimmed(value).toLowerCase();
  const s = trimmed(siteId).toLowerCase();
  if (!v) return true;
  return v === s;
}

/**
 * Build an update payload that restores the richer value per field.
 * Only overwrites a field when:
 *   - the current value is missing or a bare site label, AND
 *   - the source value is richer (non-empty, not a bare label, longer).
 * Never blanks or shortens existing data.
 */
function buildRestorePayload(current, source, fields, siteId) {
  const updates = {};
  for (const field of fields) {
    const cur = trimmed(current?.[field]);
    const src = trimmed(source?.[field]);
    if (!src) continue;
    const curIsBare = isBareSiteLabel(cur, siteId);
    const srcIsRicher = !isBareSiteLabel(src, siteId) && src.length >= cur.length;
    if (curIsBare && srcIsRicher && cur !== src) {
      updates[field] = source[field];
    }
  }
  return updates;
}

function logHeader(title) {
  console.log(`\n=== ${title} ===`);
}

async function fetchJobByNumber(supabase, jobNumber) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, customer_id, location_id, description")
    .eq("job_number", jobNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`jobs lookup (${jobNumber}): ${error.message}`);
  return data;
}

async function fetchLocationById(supabase, locationId) {
  if (!locationId) return null;
  const { data, error } = await supabase
    .from("locations")
    .select(
      "id, customer_id, location_name, street, address, building, block, city, zip_code, site_id"
    )
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw new Error(`locations lookup (${locationId}): ${error.message}`);
  return data;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    `Mode: ${APPLY ? "APPLY (writes scoped to " + TARGET_CUSTOMER_CODE + ")" : "DRY-RUN (read-only)"}`
  );

  // --- 1. Corrupted job ---
  const job = await fetchJobByNumber(supabase, TARGET_JOB_NUMBER);
  if (!job) {
    console.error(`Job ${TARGET_JOB_NUMBER} not found.`);
    process.exit(1);
  }
  logHeader(`Job ${TARGET_JOB_NUMBER}`);
  console.log(job);

  // --- 2. Customer (must be CP00127) ---
  const { data: customer, error: custErr } = await supabase
    .from("customer")
    .select("id, customer_code, customer_address, lead_id, block, unit")
    .eq("id", job.customer_id)
    .maybeSingle();
  if (custErr) throw new Error(`customer lookup: ${custErr.message}`);
  logHeader("Customer");
  console.log(customer);

  if (!customer || customer.customer_code !== TARGET_CUSTOMER_CODE) {
    console.error(
      `Safety stop: job customer_code is ${customer?.customer_code}, expected ${TARGET_CUSTOMER_CODE}.`
    );
    process.exit(1);
  }

  // --- 3. Corrupted locations row ---
  const location = await fetchLocationById(supabase, job.location_id);
  logHeader("Corrupted locations row (job 2026-007029)");
  console.log(location);

  // --- 4. customer_location rows for the customer (bill + ship) ---
  const { data: custLocs, error: custLocErr } = await supabase
    .from("customer_location")
    .select(
      "id, customer_id, location_id, site_id, address_type, address, street, building, block, street_number, city, country_name, zip_code"
    )
    .eq("customer_id", customer.id);
  if (custLocErr) throw new Error(`customer_location lookup: ${custLocErr.message}`);
  logHeader("customer_location rows (CP00127)");
  console.log(custLocs);

  // --- 5. Originating lead ---
  let lead = null;
  if (customer.lead_id) {
    const { data: leadRow, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", customer.lead_id)
      .maybeSingle();
    if (leadErr) throw new Error(`leads lookup: ${leadErr.message}`);
    lead = leadRow;
  }
  logHeader("Originating lead");
  if (lead) {
    console.log({
      id: lead.id,
      address: lead.address,
      building: lead.building,
      street: lead.street,
      block: lead.block,
      unit: lead.unit,
      postcode: lead.postcode,
      country: lead.country,
    });
    console.log("buildLeadLocationName:", buildLeadLocationName(lead));
    console.log("getCustomerAddressFromLead:", getCustomerAddressFromLead(lead));
  } else {
    console.log("(no lead linked)");
  }

  // --- 6. Sibling job (intact) for comparison ---
  const sibling = await fetchJobByNumber(supabase, SIBLING_JOB_NUMBER);
  logHeader(`Sibling job ${SIBLING_JOB_NUMBER}`);
  console.log(sibling);
  const siblingLocation = await fetchLocationById(supabase, sibling?.location_id);
  logHeader(`Sibling locations row (${SIBLING_JOB_NUMBER})`);
  console.log(siblingLocation);

  // --- 7. Determine correct full address ---
  const leadLocationName = lead ? buildLeadLocationName(lead) : null;
  const candidates = [
    siblingLocation?.location_name,
    leadLocationName,
    EXPECTED_FULL_ADDRESS,
  ]
    .map(trimmed)
    .filter(Boolean);
  // Prefer the longest non-bare candidate as the authoritative full address.
  const correctFullAddress =
    candidates
      .filter((c) => !isBareSiteLabel(c, location?.site_id))
      .sort((a, b) => b.length - a.length)[0] || EXPECTED_FULL_ADDRESS;

  logHeader("Resolved correct full address");
  console.log({
    siblingLocationName: siblingLocation?.location_name || null,
    leadLocationName,
    expected: EXPECTED_FULL_ADDRESS,
    chosen: correctFullAddress,
  });

  // Source of truth for individual columns: the intact sibling location row, with the
  // resolved full address forced onto location_name / address.
  const locationSource = {
    ...(siblingLocation || {}),
    location_name: correctFullAddress,
    address: correctFullAddress,
  };

  // --- 8. Plan + apply repair on the corrupted locations row ---
  const locationUpdates = buildRestorePayload(
    location,
    locationSource,
    LOCATION_RESTORE_FIELDS,
    location?.site_id
  );
  logHeader("Planned locations update");
  console.log(Object.keys(locationUpdates).length ? locationUpdates : "(no change needed)");

  if (APPLY && location?.id && Object.keys(locationUpdates).length) {
    const { error } = await supabase
      .from("locations")
      .update(locationUpdates)
      .eq("id", location.id)
      .eq("customer_id", customer.id);
    if (error) throw new Error(`locations update: ${error.message}`);
    console.log(`Applied locations update on id=${location.id}`);
  }

  // --- 9. Plan + apply repair on customer_location rows linked to this job's location ---
  // Scope: rows for CP00127 whose location_id matches the job's location, OR whose
  // site_id matches the corrupted location's site_id (the bill/ship pair).
  const siteId = location?.site_id;
  const targetCustLocs = (custLocs || []).filter(
    (r) =>
      (location?.id && r.location_id === location.id) ||
      (siteId && trimmed(r.site_id) === trimmed(siteId))
  );
  logHeader("customer_location rows in scope for repair");
  console.log(targetCustLocs.map((r) => ({ id: r.id, site_id: r.site_id, address_type: r.address_type, address: r.address })));

  for (const row of targetCustLocs) {
    const clSource = {
      ...row,
      address: correctFullAddress,
      street: siblingLocation?.street || row.street,
      building: siblingLocation?.building || row.building,
      block: siblingLocation?.block || row.block,
      city: siblingLocation?.city || row.city,
      zip_code: siblingLocation?.zip_code || row.zip_code,
    };
    const clUpdates = buildRestorePayload(
      row,
      clSource,
      CUSTOMER_LOCATION_RESTORE_FIELDS,
      row.site_id
    );
    console.log(`customer_location id=${row.id} planned update:`, Object.keys(clUpdates).length ? clUpdates : "(no change)");
    if (APPLY && Object.keys(clUpdates).length) {
      const { error } = await supabase
        .from("customer_location")
        .update(clUpdates)
        .eq("id", row.id)
        .eq("customer_id", customer.id);
      if (error) throw new Error(`customer_location update (${row.id}): ${error.message}`);
      console.log(`Applied customer_location update on id=${row.id}`);
    }
  }

  // --- 10. Re-query confirmation (after apply) ---
  if (APPLY) {
    logHeader("Post-repair confirmation");
    const reLoc = await fetchLocationById(supabase, location.id);
    console.log("locations:", reLoc);
    const { data: reCustLocs } = await supabase
      .from("customer_location")
      .select("id, site_id, address_type, address, street, building, block, city, zip_code, location_id")
      .eq("customer_id", customer.id);
    console.log("customer_location:", reCustLocs);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
