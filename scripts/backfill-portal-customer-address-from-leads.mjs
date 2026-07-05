/**
 * Backfill customer_address + customer_location from linked leads.
 * Fixes portal customers (e.g. CP00117) where jobs have locations but account shows N/A.
 *
 * Usage (repo root):
 *   node scripts/backfill-portal-customer-address-from-leads.mjs
 *   node scripts/backfill-portal-customer-address-from-leads.mjs CP00117
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { ensurePortalCustomerAddressFromLead } from "../lib/customers/ensurePortalCustomerAddressFromLead.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

const codeFilter = process.argv[2]?.trim() || null;

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

  let q = supabase
    .from("leads")
    .select("*")
    .not("customer_id", "is", null)
    .is("deleted_at", null);

  if (codeFilter) {
    const { data: cust } = await supabase
      .from("customer")
      .select("id")
      .eq("customer_code", codeFilter)
      .is("deleted_at", null)
      .maybeSingle();
    if (!cust?.id) {
      console.error(`Customer not found: ${codeFilter}`);
      process.exit(1);
    }
    q = q.eq("customer_id", cust.id);
  }

  const { data: leads, error } = await q;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let ok = 0;
  let skip = 0;
  for (const lead of leads || []) {
    if (!lead.customer_id) {
      skip++;
      continue;
    }
    const result = await ensurePortalCustomerAddressFromLead({
      supabase,
      customerId: lead.customer_id,
      lead,
    });
    if (result?.customerAddress) {
      ok++;
      const shipNote = result.shipLocationId ? " + ship-to" : "";
      console.log(
        `✓ ${lead.email || lead.id} → ${result.customerAddress.slice(0, 60)}…${shipNote}`
      );
    } else {
      skip++;
      console.log(`– skip (no address on lead): ${lead.email || lead.id}`);
    }
  }

  console.log(`Done. Updated ${ok}, skipped ${skip}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
