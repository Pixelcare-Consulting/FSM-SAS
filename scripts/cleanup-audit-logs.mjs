/**
 * Bulk-delete audit_logs rows older than a cutoff (default: keep May 2026 onward).
 *
 * After a large live delete, reclaim disk in Supabase SQL Editor:
 *   VACUUM ANALYZE audit_logs;
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   pnpm run audit:cleanup:dry
 *   pnpm run audit:cleanup
 *   pnpm run audit:cleanup:dry -- --before=2026-04-01
 *   pnpm run audit:cleanup -- --batch-size=5000
 *   pnpm run audit:cleanup -- --before=2026-06-01 --force
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

const DEFAULT_CUTOFF = "2026-05-01T00:00:00.000Z";
const DEFAULT_BATCH_SIZE = 5000;
const MONTHLY_SCAN_START = "2020-01-01T00:00:00.000Z";

function parseArgs(argv) {
  const out = {
    dryRun: false,
    before: DEFAULT_CUTOFF,
    batchSize: DEFAULT_BATCH_SIZE,
    force: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--force") out.force = true;
    else if (arg.startsWith("--before=")) {
      const raw = arg.slice(9).trim();
      if (raw) {
        out.before = raw.includes("T") ? raw : `${raw}T00:00:00.000Z`;
      }
    } else if (arg.startsWith("--batch-size=")) {
      const n = parseInt(arg.slice(13), 10);
      if (Number.isFinite(n) && n > 0) out.batchSize = n;
    }
  }
  return out;
}

function assertCutoffSafe(beforeIso, force) {
  const beforeMs = Date.parse(beforeIso);
  const defaultMs = Date.parse(DEFAULT_CUTOFF);
  if (!Number.isFinite(beforeMs)) {
    throw new Error(`Invalid --before date: ${beforeIso}`);
  }
  if (beforeMs > defaultMs && !force) {
    throw new Error(
      `Refusing --before=${beforeIso} (later than default ${DEFAULT_CUTOFF}). ` +
        "Pass --force to override."
    );
  }
}

function* monthRanges(fromIso, untilExclusiveIso) {
  const start = new Date(fromIso);
  const end = new Date(untilExclusiveIso);
  if (!(start < end)) return;

  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  if (cur < start) cur = new Date(start);

  while (cur < end) {
    const nextMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const rangeEnd = nextMonth < end ? nextMonth : end;
    yield {
      from: cur.toISOString(),
      to: rangeEnd.toISOString(),
      label: `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`,
    };
    cur = nextMonth;
  }
}

async function countRows(supabase, { lt, gte } = {}) {
  let q = supabase.from("audit_logs").select("id", { count: "exact", head: true });
  if (lt) q = q.lt("created_at", lt);
  if (gte) q = q.gte("created_at", gte);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function countRowsInRange(supabase, fromIso, toIso) {
  const { count, error } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fromIso)
    .lt("created_at", toIso);
  if (error) throw error;
  return count ?? 0;
}

async function monthlyBreakdown(supabase, beforeIso) {
  const rows = [];
  let total = 0;
  for (const { from, to, label } of monthRanges(MONTHLY_SCAN_START, beforeIso)) {
    const count = await countRowsInRange(supabase, from, to);
    if (count > 0) {
      rows.push({ month: label, count });
      total += count;
    }
  }
  return { rows, total };
}

async function deleteBatch(supabase, beforeIso, batchSize) {
  const { data, error: selectError } = await supabase
    .from("audit_logs")
    .select("id")
    .lt("created_at", beforeIso)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (selectError) throw selectError;
  if (!data?.length) return 0;

  const ids = data.map((r) => r.id);
  const { error: deleteError } = await supabase.from("audit_logs").delete().in("id", ids);
  if (deleteError) throw deleteError;
  return ids.length;
}

async function main() {
  const { dryRun, before, batchSize, force } = parseArgs(process.argv.slice(2));
  assertCutoffSafe(before, force);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(dryRun ? "DRY RUN" : "LIVE");
  console.log(`Cutoff (delete rows with created_at <): ${before}`);
  console.log(`Batch size: ${batchSize}`);
  if (force) console.log("Force override: enabled");
  console.log("");

  const keptCount = await countRows(supabase, { gte: before });
  const deleteCount = await countRows(supabase, { lt: before });

  console.log(`Rows to keep (created_at >= cutoff): ${keptCount.toLocaleString()}`);
  console.log(`Rows to delete (created_at < cutoff):  ${deleteCount.toLocaleString()}`);
  console.log("");

  console.log("Monthly breakdown (rows to delete):");
  const { rows: monthlyRows, total: monthlyTotal } = await monthlyBreakdown(supabase, before);
  if (!monthlyRows.length) {
    console.log("  (none)");
  } else {
    for (const { month, count } of monthlyRows) {
      console.log(`  ${month}: ${count.toLocaleString()}`);
    }
    console.log(`  Total: ${monthlyTotal.toLocaleString()}`);
    if (monthlyTotal !== deleteCount) {
      console.log(
        `  Note: monthly sum (${monthlyTotal}) differs from head count (${deleteCount}) — check date ranges.`
      );
    }
  }

  if (dryRun) {
    console.log("\nDry-run complete — no rows deleted.");
    return;
  }

  if (deleteCount === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  console.log("\nDeleting in batches…");
  let deleted = 0;
  let batchNum = 0;
  while (true) {
    const n = await deleteBatch(supabase, before, batchSize);
    if (n === 0) break;
    deleted += n;
    batchNum += 1;
    console.log(`  batch ${batchNum}: deleted ${n.toLocaleString()} (total ${deleted.toLocaleString()})`);
    if (n < batchSize) break;
  }

  const remaining = await countRows(supabase, { lt: before });
  console.log(`\nSummary: deleted ${deleted.toLocaleString()}, remaining below cutoff: ${remaining.toLocaleString()}`);
  if (deleted > 0) {
    console.log("Next: run VACUUM ANALYZE audit_logs; in Supabase SQL Editor to reclaim space.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
