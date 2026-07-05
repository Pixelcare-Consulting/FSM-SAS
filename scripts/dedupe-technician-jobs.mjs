/**
 * Soft-delete duplicate active technician_jobs (same technician_id + job_id).
 * Repoints attendance/media/signatures; removes technician_hours on losers.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   pnpm run labor:dedupe:dry
 *   pnpm run labor:dedupe
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

function groupDuplicates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.technician_id}:${row.job_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function pickWinner(group) {
  return group.reduce((best, row) =>
    scoreTechnicianJobRow(row) > scoreTechnicianJobRow(best) ? row : best
  );
}

async function repoint(supabase, table, winnerId, loserId) {
  const { error } = await supabase.from(table).update({ technician_job_id: winnerId }).eq("technician_job_id", loserId);
  if (error && error.code !== "PGRST205") {
    console.warn(`  repoint ${table}:`, error.message);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("technician_jobs")
      .select("id, technician_id, job_id, assignment_status, started_at, completed_at, accumulated_hours, updated_at, created_at")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    all.push(...data);
    offset += data.length;
    if (data.length < PAGE) break;
  }

  const dupGroups = groupDuplicates(all);
  const loserCount = dupGroups.reduce((n, g) => n + g.length - 1, 0);

  console.log(`Active technician_jobs: ${all.length}`);
  console.log(`Duplicate groups: ${dupGroups.length} (${loserCount} rows to soft-delete)`);

  if (!dupGroups.length) {
    console.log("Nothing to dedupe.");
    return;
  }

  for (const group of dupGroups) {
    const winner = pickWinner(group);
    const losers = group.filter((r) => r.id !== winner.id);
    console.log(`\njob ${winner.job_id} / tech ${winner.technician_id}: keep ${winner.id}, drop ${losers.length}`);

    if (dryRun) continue;

    for (const loser of losers) {
      await repoint(supabase, "attendance", winner.id, loser.id);
      await repoint(supabase, "job_media", winner.id, loser.id);
      await repoint(supabase, "job_signatures", winner.id, loser.id);
      await repoint(supabase, "job_messages", winner.id, loser.id);

      await supabase.from("technician_hours").delete().eq("technician_job_id", loser.id);

      const { error: delErr } = await supabase
        .from("technician_jobs")
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", loser.id);
      if (delErr) console.error(`  soft-delete ${loser.id}:`, delErr.message);
    }
  }

  console.log(dryRun ? "\nDRY RUN — no changes written" : "\nDone. Run: pnpm run labor:backfill");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
