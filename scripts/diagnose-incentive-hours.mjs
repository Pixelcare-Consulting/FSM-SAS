/**
 * Read-only diagnostics for incentive hour roll-ups (e.g. A1/A2 June 2026 mismatch).
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage (repo root):
 *   pnpm exec node scripts/diagnose-incentive-hours.mjs
 *   pnpm exec node scripts/diagnose-incentive-hours.mjs --year=2026 --month=6 --codes=A1,A2
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import {
  fetchFsmHoursSumByTechnicianForPeriod,
  formatFsmPeriodLabel,
  getFsmLaborPeriodTimezone,
  getFsmPeriodRangeMs,
} from "../lib/supabase/technicianHours.js";
import { fetchTechnicianJobsLaborInPeriod } from "../lib/supabase/reports.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

function parseArgs(argv) {
  const out = { year: 2026, month: 6, codes: ["A1SinKiatLee", "A2Mazlan"] };
  for (const arg of argv) {
    if (arg.startsWith("--year=")) out.year = parseInt(arg.slice(7), 10);
    else if (arg.startsWith("--month=")) out.month = parseInt(arg.slice(8), 10);
    else if (arg.startsWith("--codes=")) {
      out.codes = arg
        .slice(8)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    }
  }
  return out;
}

async function main() {
  const { year, month, codes } = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tz = getFsmLaborPeriodTimezone();
  const { startMs, endMs } = getFsmPeriodRangeMs("M", year, month, 1, tz);
  const periodLabel = formatFsmPeriodLabel("M", year, month, 1, tz);

  console.log("=== Incentive hours diagnostic ===");
  console.log(`Period: ${periodLabel}`);
  console.log(`Bounds (UTC instants): ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()}`);
  console.log(`SAP tech codes filter: ${codes.join(", ")}`);
  console.log("");

  const { data: workers, error: wErr } = await supabase
    .from("technicians")
    .select("id, full_name, email, sap_tech_code, sap_udt_total_working_hrs, sap_udt_snapshot_label")
    .in("sap_tech_code", codes);

  if (wErr) {
    console.error("Failed to load technicians:", wErr.message);
    process.exit(1);
  }

  if (!workers?.length) {
    console.warn("No technicians found for codes:", codes.join(", "));
    console.warn("Try adjusting --codes= or confirm sap_tech_code in portal.");
  }

  const { data: cachedMap, error: cErr } = await fetchFsmHoursSumByTechnicianForPeriod(supabase, startMs, endMs);
  if (cErr) {
    console.error("technician_hours query failed:", cErr.message);
    process.exit(1);
  }

  const { data: liveRows, error: lErr } = await fetchTechnicianJobsLaborInPeriod(supabase, startMs, endMs);
  if (lErr) {
    console.error("Live assignment query failed:", lErr.message);
    process.exit(1);
  }

  const liveByTech = {};
  for (const row of liveRows || []) {
    const id = row.technician?.id;
    if (!id) continue;
    liveByTech[id] = (liveByTech[id] || 0) + (Number(row.laborHours) || 0);
  }
  for (const id of Object.keys(liveByTech)) {
    liveByTech[id] = Math.round(liveByTech[id] * 100) / 100;
  }

  for (const worker of workers || []) {
    const cached = Math.round((cachedMap?.[worker.id] ?? 0) * 100) / 100;
    const live = liveByTech[worker.id] ?? 0;
    const top = (liveRows || [])
      .filter((r) => r.technician?.id === worker.id)
      .sort((a, b) => (b.laborHours || 0) - (a.laborHours || 0))
      .slice(0, 5);

    console.log(`--- ${worker.sap_tech_code} · ${worker.full_name} (${worker.id}) ---`);
    console.log(`  FSM cached (technician_hours): ${cached}`);
    console.log(`  FSM live (assignments):        ${live}`);
    console.log(`  SAP snapshot hrs / label:      ${worker.sap_udt_total_working_hrs ?? "—"} / ${worker.sap_udt_snapshot_label ?? "—"}`);
    if (Math.abs(cached - live) > 0.01) {
      console.log("  ⚠ Cache vs live mismatch — run scripts/backfill-technician-hours.mjs");
    }
    if (top.length) {
      console.log("  Top assignments by hours:");
      for (const r of top) {
        console.log(
          `    ${r.job?.job_number ?? "?"} · ${(r.laborHours || 0).toFixed(2)}h · ${r.job?.title ?? ""}`
        );
      }
    } else {
      console.log("  No assignments in period.");
    }
    console.log("");
  }

  console.log("SAP UDT cross-match (requires live UDT rows — skipped unless SAP session available).");
  console.log("Use Job Incentives Refresh all, then re-run with UDT exported, or check /api/sap/incentives.");
  console.log("");
  console.log("To verify code-first matching after fix, pass UDT rows to findUdtRowsMatchedByMultipleWorkers");
  console.log("(no conflicts expected when sap_tech_code is set for each worker).");

  if (workers?.length >= 2) {
    console.log("");
    console.log("Distinct FSM cached totals:", [...new Set((workers || []).map((w) => cachedMap?.[w.id] ?? 0))].length);
    console.log("Distinct FSM live totals:", [...new Set((workers || []).map((w) => liveByTech[w.id] ?? 0))].length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
