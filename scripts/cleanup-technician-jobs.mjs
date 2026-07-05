/**
 * Clean duplicate technician_jobs from testing / migrations.
 *
 * Phase 1 — Active duplicates (deleted_at IS NULL): soft-delete extras, keep best row per tech+job.
 * Phase 2 — Purge soft-deleted superseded rows when an active row exists for same tech+job.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   pnpm run labor:cleanup:dry
 *   pnpm run labor:cleanup
 *   pnpm run labor:cleanup:dry -- --job-id=000881b8-27e4-4582-bf19-1eccccb61f7f
 *   pnpm run labor:cleanup -- --job-id=... --purge-deleted
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { scoreTechnicianJobRow } from "../lib/supabase/dedupeTechnicianJobs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

const PAGE = 1000;
const REPOINT_TABLES = ["attendance", "job_media", "job_signatures", "job_messages"];

function parseArgs(argv) {
  const out = { dryRun: false, jobId: null, purgeDeleted: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--job-id=")) out.jobId = arg.slice(9).trim() || null;
    else if (arg === "--purge-deleted") out.purgeDeleted = true;
  }
  return out;
}

function groupByTechJob(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.technician_id}:${row.job_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function pickWinner(group) {
  return group.reduce((best, row) =>
    scoreTechnicianJobRow(row) > scoreTechnicianJobRow(best) ? row : best
  );
}

function isActive(row) {
  return row.deleted_at == null || row.deleted_at === "";
}

async function fetchAllRows(supabase, jobId) {
  const all = [];
  let offset = 0;
  for (;;) {
    let q = supabase
      .from("technician_jobs")
      .select(
        "id, technician_id, job_id, assignment_status, started_at, completed_at, accumulated_hours, created_at, updated_at, deleted_at"
      )
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (jobId) q = q.eq("job_id", jobId);

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    offset += data.length;
    if (data.length < PAGE) break;
  }
  return all;
}

async function repoint(supabase, table, winnerId, loserId) {
  const { error } = await supabase.from(table).update({ technician_job_id: winnerId }).eq("technician_job_id", loserId);
  if (error && error.code !== "PGRST205" && error.code !== "42P01") {
    console.warn(`  repoint ${table}:`, error.message);
  }
}

async function softDeleteLoser(supabase, winner, loser) {
  for (const table of REPOINT_TABLES) {
    await repoint(supabase, table, winner.id, loser.id);
  }
  await supabase.from("technician_hours").delete().eq("technician_job_id", loser.id);
  const { error } = await supabase
    .from("technician_jobs")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", loser.id);
  if (error) throw error;
}

async function hardPurgeRow(supabase, rowId) {
  await supabase.from("technician_hours").delete().eq("technician_job_id", rowId);
  const { error } = await supabase.from("technician_jobs").delete().eq("id", rowId);
  if (error) throw error;
}

async function main() {
  const { dryRun, jobId, purgeDeleted } = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const all = await fetchAllRows(supabase, jobId);
  const active = all.filter(isActive);
  const groups = groupByTechJob(all);

  let softDeleteCount = 0;
  let purgeCount = 0;

  console.log(dryRun ? "DRY RUN" : "LIVE");
  if (jobId) console.log(`Filter job_id: ${jobId}`);
  console.log(`Rows loaded: ${all.length} (${active.length} active, ${all.length - active.length} soft-deleted)`);
  console.log("");

  // Phase 1: active duplicates
  console.log("=== Phase 1: active duplicates (soft-delete losers) ===");
  for (const [, group] of groups) {
    const activeRows = group.filter(isActive);
    if (activeRows.length <= 1) continue;

    const winner = pickWinner(activeRows);
    const losers = activeRows.filter((r) => r.id !== winner.id);
    softDeleteCount += losers.length;

    console.log(`tech ${winner.technician_id} / job ${winner.job_id}`);
    console.log(`  keep: ${winner.id} (completed ${winner.completed_at || "—"})`);
    for (const loser of losers) {
      console.log(`  soft-delete: ${loser.id} (completed ${loser.completed_at || "—"})`);
      if (!dryRun) await softDeleteLoser(supabase, winner, loser);
    }
  }
  if (softDeleteCount === 0) console.log("No active duplicate groups.");

  // Phase 2: purge soft-deleted when active canonical exists
  if (purgeDeleted) {
    console.log("\n=== Phase 2: purge soft-deleted superseded rows ===");
    for (const [, group] of groups) {
      const activeRows = group.filter(isActive);
      const deletedRows = group.filter((r) => !isActive(r));
      if (!activeRows.length || !deletedRows.length) continue;

      const winner = pickWinner(activeRows);
      for (const row of deletedRows) {
        purgeCount += 1;
        console.log(`  hard-delete ${row.id} (superseded by active ${winner.id})`);
        if (!dryRun) await hardPurgeRow(supabase, row.id);
      }
    }
    if (purgeCount === 0) console.log("No soft-deleted rows to purge.");
  } else {
    console.log("\n(Skip phase 2 — pass --purge-deleted to hard-delete old soft-deleted rows)");
  }

  console.log(
    `\nSummary: soft-delete ${softDeleteCount}, hard-purge ${purgeCount}${dryRun ? " (dry-run)" : ""}`
  );
  if (!dryRun && (softDeleteCount > 0 || purgeCount > 0)) {
    console.log("Next: pnpm run labor:backfill");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
