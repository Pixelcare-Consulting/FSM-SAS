/**
 * Materialized FSM labor hours per technician_jobs row (technician_hours table).
 * Keeps incentive math aligned with lib/supabase/reports.js helpers.
 */

import {
  assignmentPeriodAnchorMs,
  calculateTechnicianJobIncentive,
  fetchTechnicianJobsLaborInPeriod,
} from "./reports.js";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Company timezone for FSM labor month buckets (env FSM_LABOR_PERIOD_TZ, default Asia/Singapore). */
export function getFsmLaborPeriodTimezone() {
  const fromPublic =
    typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_FSM_LABOR_PERIOD_TZ?.trim() : "";
  const fromServer = typeof process !== "undefined" ? process.env?.FSM_LABOR_PERIOD_TZ?.trim() : "";
  return fromPublic || fromServer || "Asia/Singapore";
}

function daysInCalendarMonth(year, month1) {
  return new Date(year, month1, 0).getDate();
}

/** Wall-clock in `timeZone` → UTC epoch ms (handles DST). */
function zonedLocalPartsToUtcMs(y, mo, d, h, mi, s, ms, timeZone) {
  let instant = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(instant));
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"), 0);
    const wantUtc = Date.UTC(y, mo - 1, d, h, mi, s, 0);
    const diff = wantUtc - asUtc;
    if (diff === 0) return instant;
    instant += diff;
  }
  return instant;
}

function zonedMonthBoundsMs(year, month1, timeZone) {
  const startMs = zonedLocalPartsToUtcMs(year, month1, 1, 0, 0, 0, 0, timeZone);
  const lastDay = daysInCalendarMonth(year, month1);
  const endMs = zonedLocalPartsToUtcMs(year, month1, lastDay, 23, 59, 59, 999, timeZone);
  return { startMs, endMs };
}

/** Calendar range for FSM labor rollup in company timezone (period_anchor_at compared as UTC instants). */
export function getFsmPeriodRangeMs(filterType, year, month, quarter, timeZone = getFsmLaborPeriodTimezone()) {
  const y = Number(year);
  if (!Number.isFinite(y)) return { startMs: 0, endMs: 0, timeZone };
  if (filterType === "Q") {
    const q = Number(quarter);
    const qn = Number.isFinite(q) ? q : 1;
    const qStartMonth = (qn - 1) * 3 + 1;
    const qEndMonth = qStartMonth + 2;
    const start = zonedMonthBoundsMs(y, qStartMonth, timeZone);
    const end = zonedMonthBoundsMs(y, qEndMonth, timeZone);
    return { startMs: start.startMs, endMs: end.endMs, timeZone };
  }
  const m = Number(month);
  const mo = Number.isFinite(m) ? m : 1;
  const { startMs, endMs } = zonedMonthBoundsMs(y, mo, timeZone);
  return { startMs, endMs, timeZone };
}

export function formatFsmPeriodLabel(filterType, year, month, quarter, timeZone = getFsmLaborPeriodTimezone()) {
  const { startMs, endMs } = getFsmPeriodRangeMs(filterType, year, month, quarter, timeZone);
  if (!startMs || !endMs) return "";
  const start = new Date(startMs).toISOString().slice(0, 10);
  const end = new Date(endMs).toISOString().slice(0, 10);
  if (filterType === "Q") {
    const qn = Number(quarter) || 1;
    return `Q${qn} ${year}: ${start} → ${end} (${timeZone})`;
  }
  const mo = Number(month) || 1;
  const monthLabel = MONTH_SHORT[Math.max(0, Math.min(11, mo - 1))] || String(mo);
  return `${monthLabel} ${year}: ${start} → ${end} (${timeZone})`;
}

/** Embed shape matches fetchTechnicianJobsLaborInPeriod for consistent labor math */
const TECHNICIAN_JOB_INCENTIVE_EMBED = `
      id,
      technician_id,
      deleted_at,
      started_at,
      completed_at,
      assignment_status,
      technician:technician_id(id, full_name, job_incentive_hourly_rate),
      job:job_id(job_number, title, customer:customer_id(customer_name), scheduled_start, scheduled_end, deleted_at, status)
    `;

/**
 * @param {object} row technician_jobs row with technician + job embeds (see TECHNICIAN_JOB_INCENTIVE_EMBED)
 * @returns {{ labor_hours: number, period_anchor_ms: number }}
 */
export function buildTechnicianHoursPayloadFromAssignmentRow(row) {
  const anchorMs = assignmentPeriodAnchorMs(row);
  const { laborHours } = calculateTechnicianJobIncentive(row);
  const labor_hours = Number.isFinite(laborHours) ? Math.round(laborHours * 10000) / 10000 : 0;
  return { labor_hours, period_anchor_ms: anchorMs };
}

/**
 * Upsert or delete technician_hours for one assignment (soft-deleted / invalid anchor → delete cached row).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} technicianJobId
 */
export async function upsertTechnicianHoursForTechnicianJobId(supabase, technicianJobId) {
  if (!supabase || !technicianJobId) return { error: new Error("Missing supabase or technicianJobId") };

  const { data: row, error } = await supabase
    .from("technician_jobs")
    .select(TECHNICIAN_JOB_INCENTIVE_EMBED)
    .eq("id", technicianJobId)
    .maybeSingle();

  if (error) return { error };
  if (!row) return { error: new Error("technician_job not found") };

  if (row.deleted_at != null || row.job?.deleted_at) {
    const { error: delErr } = await supabase.from("technician_hours").delete().eq("technician_job_id", technicianJobId);
    return { error: delErr };
  }

  const { labor_hours, period_anchor_ms } = buildTechnicianHoursPayloadFromAssignmentRow(row);
  if (!Number.isFinite(period_anchor_ms)) {
    const { error: delErr } = await supabase.from("technician_hours").delete().eq("technician_job_id", technicianJobId);
    return { error: delErr };
  }

  const computed_at = new Date().toISOString();
  const payload = {
    technician_job_id: row.id,
    technician_id: row.technician_id,
    labor_hours,
    period_anchor_at: new Date(period_anchor_ms).toISOString(),
    computed_at,
  };

  const { error: upErr } = await supabase.from("technician_hours").upsert(payload, {
    onConflict: "technician_job_id",
  });

  return { error: upErr };
}

/**
 * Refresh cached hours for every technician_job on a job (e.g. job schedule changed).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 */
export async function refreshTechnicianHoursForJobId(supabase, jobId) {
  if (!supabase || !jobId) return { error: new Error("Missing supabase or jobId") };

  const { data: rows, error } = await supabase.from("technician_jobs").select("id").eq("job_id", jobId);
  if (error) return { error };

  for (const r of rows || []) {
    const { error: oneErr } = await upsertTechnicianHoursForTechnicianJobId(supabase, r.id);
    if (oneErr) return { error: oneErr };
  }
  return { error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} technicianJobIds
 */
export async function refreshTechnicianHoursForTechnicianJobIds(supabase, technicianJobIds) {
  if (!supabase || !technicianJobIds?.length) return { error: null };
  for (const id of technicianJobIds) {
    const { error } = await upsertTechnicianHoursForTechnicianJobId(supabase, id);
    if (error) return { error };
  }
  return { error: null };
}

function roundHoursMap(map) {
  for (const k of Object.keys(map)) {
    map[k] = Math.round(map[k] * 100) / 100;
  }
  return map;
}

/**
 * Sum technician_hours.labor_hours per technician for [startMs, endMs] (paginated PostgREST).
 * Excludes rows whose assignment was soft-deleted.
 */
export async function fetchFsmHoursSumByTechnicianFromTable(supabase, startMs, endMs) {
  if (!supabase) return { data: null, error: new Error("No Supabase client") };
  const start = Number(startMs);
  const end = Number(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { data: null, error: new Error("Invalid period bounds") };
  }

  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const map = {};
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("technician_hours")
      .select("technician_id, labor_hours")
      .gte("period_anchor_at", startIso)
      .lte("period_anchor_at", endIso)
      .not("period_anchor_at", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) return { data: null, error };

    const rows = data || [];
    for (const row of rows) {
      const id = row.technician_id;
      if (!id) continue;
      const h = Number(row.labor_hours);
      map[id] = (map[id] || 0) + (Number.isFinite(h) ? h : 0);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { data: roundHoursMap(map), error: null };
}

/**
 * Sum materialized hours per technician for [startMs, endMs] via Postgres RPC (when deployed).
 */
async function fetchFsmHoursSumByTechnicianRpc(supabase, startMs, endMs) {
  const start = Number(startMs);
  const end = Number(endMs);
  const { data, error } = await supabase.rpc("fsm_hours_sum_by_technician", {
    p_start: new Date(start).toISOString(),
    p_end: new Date(end).toISOString(),
  });

  if (error) return { data: null, error };

  const map = {};
  for (const row of data || []) {
    const id = row.technician_id;
    if (!id) continue;
    const h = Number(row.total_hours);
    map[id] = Number.isFinite(h) ? h : 0;
  }
  return { data: roundHoursMap(map), error: null };
}

/**
 * Primary loader for incentives "Total hrs (FSM)": always read technician_hours (browser RLS-safe).
 * RPC is only used when the direct table query fails (e.g. table missing).
 * @returns {Promise<{ data: Record<string, number>|null, error: Error|null }>}
 */
export async function fetchFsmHoursSumByTechnicianForPeriod(supabase, startMs, endMs) {
  if (!supabase) return { data: null, error: new Error("No Supabase client") };

  const tableRes = await fetchFsmHoursSumByTechnicianFromTable(supabase, startMs, endMs);
  if (!tableRes.error) return tableRes;

  const rpcRes = await fetchFsmHoursSumByTechnicianRpc(supabase, startMs, endMs);
  if (!rpcRes.error) return rpcRes;

  return { data: null, error: tableRes.error || rpcRes.error };
}

/**
 * Client-side fallback when RPC/table missing or empty migration — matches incentive rollup semantics.
 */
export async function fetchFsmHoursSumByTechnicianFallback(supabase, startMs, endMs) {
  const { data: rows, error } = await fetchTechnicianJobsLaborInPeriod(supabase, startMs, endMs);
  if (error) return { data: null, error };
  const map = {};
  for (const row of rows || []) {
    const id = row.technician?.id;
    if (!id) continue;
    const h = Number(row.laborHours);
    map[id] = (map[id] || 0) + (Number.isFinite(h) ? h : 0);
  }
  for (const k of Object.keys(map)) {
    map[k] = Math.round(map[k] * 100) / 100;
  }
  return { data: map, error: null };
}
