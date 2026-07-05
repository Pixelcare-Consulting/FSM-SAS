/**
 * Read-only outlier report (mirrors scripts/diagnose-technician-labor-outliers.sql).
 *
 * Usage:
 *   pnpm run labor:diagnose:outliers
 *   pnpm run labor:diagnose:outliers -- --limit=30
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

function parseLimit(argv) {
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) return parseInt(arg.slice(8), 10) || 30;
  }
  return 30;
}

function spanHours(started, completed) {
  if (!started || !completed) return null;
  const ms = new Date(completed) - new Date(started);
  return ms > 0 ? ms / 3600000 : null;
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("technician_jobs")
    .select(
      `
      id, assignment_status, started_at, completed_at, accumulated_hours,
      job:job_id(job_number, scheduled_start, scheduled_end, deleted_at),
      technician_hours(labor_hours, period_anchor_at)
    `
    )
    .is("deleted_at", null)
    .limit(8000);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = (data || []).filter((r) => !r.job?.deleted_at);
  const withSpan = rows
    .map((r) => ({
      job_number: r.job?.job_number,
      status: r.assignment_status,
      raw_span_h: spanHours(r.started_at, r.completed_at),
      cached_h: Array.isArray(r.technician_hours)
        ? r.technician_hours[0]?.labor_hours
        : r.technician_hours?.labor_hours,
      started_at: r.started_at,
      scheduled_start: r.job?.scheduled_start,
      accumulated_hours: r.accumulated_hours,
    }))
    .filter((r) => r.raw_span_h != null)
    .sort((a, b) => b.raw_span_h - a.raw_span_h);

  console.log(`=== Top ${limit} raw timestamp spans ===`);
  for (const r of withSpan.slice(0, limit)) {
    console.log(
      `  ${r.job_number} · ${r.raw_span_h?.toFixed(2)}h raw · cached ${r.cached_h ?? "—"} · ${r.status}`
    );
  }

  const stale = rows.filter((r) => {
    if (!r.started_at || !r.job?.scheduled_start) return false;
    const started = new Date(r.started_at).getTime();
    const sched = new Date(r.job.scheduled_start).getTime();
    return started < sched - 7 * 86400000;
  });
  console.log(`\n=== Stale started_at (>7d before schedule): ${stale.length} rows ===`);
  for (const r of stale.slice(0, 10)) {
    console.log(`  ${r.job?.job_number} · started ${r.started_at} · sched ${r.job?.scheduled_start}`);
  }

  const inProgCompleted = rows.filter(
    (r) => String(r.assignment_status).toUpperCase() !== "COMPLETED" && r.completed_at
  );
  console.log(`\n=== In-progress with completed_at set: ${inProgCompleted.length} rows ===`);
  for (const r of inProgCompleted.slice(0, 10)) {
    console.log(`  ${r.job?.job_number} · ${r.assignment_status}`);
  }

  const dupMap = new Map();
  for (const r of rows) {
    const k = `${r.technician_id}:${r.job_id}`;
    dupMap.set(k, (dupMap.get(k) || 0) + 1);
  }
  const dupGroups = [...dupMap.entries()].filter(([, c]) => c > 1);
  console.log(`\n=== Duplicate active assignments (tech+job): ${dupGroups.length} groups ===`);
  dupGroups
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([key, cnt]) => console.log(`  ${key} · ${cnt} rows`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
