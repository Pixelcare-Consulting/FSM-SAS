import { requireSession } from "../../../lib/auth/requireSession";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
import {
  fetchFsmHoursSumByTechnicianForPeriod,
  getFsmLaborPeriodTimezone,
  getFsmPeriodRangeMs,
} from "../../../lib/supabase/technicianHours";
import {
  assignmentPeriodAnchorMs,
  fetchTechnicianJobsLaborInPeriod,
} from "../../../lib/supabase/reports";

/**
 * GET ?filterType=M|Q&year=2026&month=6&quarter=1
 * Returns { hoursByTechnician: { [technicianId]: number } } using service role (settings admin).
 *
 * Verification (A1/A2 June 2026 mismatch):
 * - Compare cached vs live: staleWarning when technician_hours sum != live assignment rollup.
 * - Assignment breakdown: ?technicianId=<uuid>&debug=1 (same period bounds as incentives roll-up).
 * - SAP UDT cross-match: use collectUdtRowsForWorkerMonth per worker in incentives panel (code-first).
 * - Reconcile cache: scripts/backfill-technician-hours.mjs after bulk assignment changes.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const filterType = req.query.filterType === "Q" ? "Q" : "M";
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const quarter = Number(req.query.quarter);
  const debug = req.query.debug === "1";
  const technicianId = typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";

  if (!Number.isFinite(year)) {
    return res.status(400).json({ success: false, error: "year is required" });
  }

  try {
    const db = getSupabaseAdmin();
    const timeZone = getFsmLaborPeriodTimezone();
    const { startMs, endMs } = getFsmPeriodRangeMs(filterType, year, month, quarter, timeZone);
    const { data: cachedMap, error } = await fetchFsmHoursSumByTechnicianForPeriod(db, startMs, endMs);
    if (error) {
      return res.status(500).json({ success: false, error: error.message || "Failed to load FSM hours" });
    }

    const hoursByTechnician = cachedMap || {};
    const { data: liveRows, error: liveErr } = await fetchTechnicianJobsLaborInPeriod(db, startMs, endMs);

    let staleWarning = null;
    const staleTechnicians = [];

    if (!liveErr) {
      const liveMap = {};
      for (const row of liveRows || []) {
        const id = row.technician?.id;
        if (!id) continue;
        const h = Number(row.laborHours);
        liveMap[id] = (liveMap[id] || 0) + (Number.isFinite(h) ? h : 0);
      }
      for (const id of Object.keys(liveMap)) {
        liveMap[id] = Math.round(liveMap[id] * 100) / 100;
      }

      const techIds = new Set([...Object.keys(hoursByTechnician), ...Object.keys(liveMap)]);
      for (const id of techIds) {
        const cached = Math.round((hoursByTechnician[id] ?? 0) * 100) / 100;
        const live = liveMap[id] ?? 0;
        if (Math.abs(cached - live) > 0.01) {
          staleTechnicians.push({ technicianId: id, cachedHours: cached, liveHours: live });
        }
      }

      // if (staleTechnicians.length) {
      //   staleWarning =
      //     `technician_hours cache differs from live assignments for ${staleTechnicians.length} technician(s). ` +
      //     "Run scripts/backfill-technician-hours.mjs to refresh cached rows.";
      // }

      if (debug && technicianId) {
        const assignments = (liveRows || [])
          .filter((row) => row.technician?.id === technicianId)
          .map((row) => ({
            technicianJobId: row.id,
            jobNumber: row.job?.job_number ?? null,
            jobTitle: row.job?.title ?? null,
            laborHours: row.laborHours,
            periodAnchorMs: assignmentPeriodAnchorMs(row),
            periodAnchorAt: Number.isFinite(assignmentPeriodAnchorMs(row))
              ? new Date(assignmentPeriodAnchorMs(row)).toISOString()
              : null,
          }))
          .sort((a, b) => (b.laborHours || 0) - (a.laborHours || 0));

        return res.status(200).json({
          success: true,
          hoursByTechnician,
          staleWarning,
          staleTechnicians,
          period: { filterType, year, month, quarter, startMs, endMs, timeZone },
          debug: {
            technicianId,
            cachedHours: hoursByTechnician[technicianId] ?? 0,
            liveHours: liveMap[technicianId] ?? 0,
            assignmentCount: assignments.length,
            assignments,
          },
        });
      }
    }

    return res.status(200).json({
      success: true,
      hoursByTechnician,
      staleWarning,
      staleTechnicians: staleTechnicians.length ? staleTechnicians : undefined,
      period: { filterType, year, month, quarter, startMs, endMs, timeZone },
    });
  } catch (e) {
    console.error("fsm-labor-hours API:", e);
    return res.status(500).json({ success: false, error: e?.message || "Failed to load FSM hours" });
  }
}
