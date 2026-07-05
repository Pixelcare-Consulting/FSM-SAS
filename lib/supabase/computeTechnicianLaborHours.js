/**
 * Mirrors public.fn_compute_technician_labor_hours (Supabase migration).
 * Mobile owns started_at / completed_at / accumulated_hours on technician_jobs.
 */

import { getFsmLaborPeriodTimezone } from "./technicianHours.js";

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const STALE_BEFORE_SCHEDULE_MS = 7 * MS_PER_DAY;

function calendarDaysSpanned(startMs, endMs, timeZone) {
  const dayUtc = (ms) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
    return Date.UTC(get("year"), get("month") - 1, get("day"));
  };
  const startDay = dayUtc(startMs);
  const endDay = dayUtc(endMs);
  return Math.max(1, Math.round((endDay - startDay) / MS_PER_DAY) + 1);
}

/**
 * @param {object} row
 * @param {string|null|undefined} row.started_at
 * @param {string|null|undefined} row.completed_at
 * @param {number|string|null|undefined} row.accumulated_hours
 * @param {string|null|undefined} row.assignment_status
 * @param {string|null|undefined} row.scheduled_start
 * @param {string|null|undefined} row.scheduled_end
 * @param {number} [maxHoursPerDay=16]
 * @param {string} [timeZone]
 * @returns {number}
 */
export function computeTechnicianLaborHours(row, maxHoursPerDay = 16, timeZone = getFsmLaborPeriodTimezone()) {
  const status = String(row?.assignment_status || "").toUpperCase();
  if (status !== "COMPLETED") return 0;

  const accumulated = Number(row?.accumulated_hours);
  if (Number.isFinite(accumulated) && accumulated > 0) {
    return Math.round(accumulated * 10000) / 10000;
  }

  const startedMs = row?.started_at ? new Date(row.started_at).getTime() : NaN;
  const completedMs = row?.completed_at ? new Date(row.completed_at).getTime() : NaN;
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs) || completedMs <= startedMs) {
    return 0;
  }

  const schedStartMs = row?.scheduled_start ? new Date(row.scheduled_start).getTime() : NaN;
  const schedEndMs = row?.scheduled_end ? new Date(row.scheduled_end).getTime() : NaN;

  if (Number.isFinite(schedStartMs) && startedMs < schedStartMs - STALE_BEFORE_SCHEDULE_MS) {
    return scheduleSlotHours(schedStartMs, schedEndMs);
  }

  // Completion long after appointment window without mobile accumulated_hours → use slot (e.g. #2026-001302)
  if (
    Number.isFinite(schedEndMs) &&
    completedMs > schedEndMs + 2 * MS_PER_DAY
  ) {
    return scheduleSlotHours(schedStartMs, schedEndMs);
  }

  const spanH = (completedMs - startedMs) / MS_PER_HOUR;
  const days = calendarDaysSpanned(startedMs, completedMs, timeZone);
  let laborH = Math.min(spanH, days * maxHoursPerDay);

  const slotH = scheduleSlotHours(schedStartMs, schedEndMs);
  if (slotH > 0 && laborH > slotH * 4) {
    laborH = slotH;
  }

  return Math.round(laborH * 10000) / 10000;
}

function scheduleSlotHours(schedStartMs, schedEndMs) {
  if (!Number.isFinite(schedStartMs) || !Number.isFinite(schedEndMs) || schedEndMs <= schedStartMs) {
    return 0;
  }
  return Math.round(((schedEndMs - schedStartMs) / MS_PER_HOUR) * 10000) / 10000;
}

/**
 * Mirrors fn_technician_hours_period_anchor.
 * @returns {string|null} ISO timestamp
 */
export function technicianHoursPeriodAnchorIso(row) {
  const status = String(row?.assignment_status || "").toUpperCase();
  if (status !== "COMPLETED" || !row?.completed_at) return null;
  const t = new Date(row.completed_at).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
