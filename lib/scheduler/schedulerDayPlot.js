import { isSameDay, startOfDay, addDays, isValid, endOfDay } from "date-fns";

const ONE_HOUR_MS = 60 * 60 * 1000;

function getAppointmentEndMs(job) {
  const startMs = new Date(job.start).getTime();
  const endMs = new Date(job.end).getTime();
  if (Number.isFinite(endMs) && Number.isFinite(startMs) && endMs > startMs) {
    return endMs;
  }
  return Number.isFinite(startMs) ? startMs : endMs;
}

function getWorkEndMs(job) {
  if (job?.workEnd) {
    const w = new Date(job.workEnd).getTime();
    const startMs = new Date(job.start).getTime();
    if (Number.isFinite(w) && Number.isFinite(startMs) && w > startMs) return w;
  }
  return null;
}

/**
 * Daily work window length for day-view card width (job_schedule.dur / workEnd).
 */
export function getJobDailyWorkWindowMs(job) {
  const dur =
    job.durationHours != null && job.durationHours !== ""
      ? parseFloat(job.durationHours)
      : NaN;
  if (Number.isFinite(dur) && !isNaN(dur) && dur > 0) {
    return dur * ONE_HOUR_MS;
  }

  const rawStart = new Date(job.start);
  const workEndMs = getWorkEndMs(job);
  if (isValid(rawStart) && workEndMs != null) {
    const workEnd = new Date(workEndMs);
    if (isSameDay(rawStart, workEnd)) {
      return workEndMs - rawStart.getTime();
    }
  }

  return ONE_HOUR_MS;
}

/**
 * Project a job's daily clock window onto a calendar day for day-view plotting.
 * Span inclusion matches week view: appointment start/end overlap the day.
 */
export function getJobPlotRangeForDay(job, selectedDay, options = {}) {
  const { firstHour: _firstHour = 7 } = options;

  const selectedDayStart = startOfDay(selectedDay);
  const dayStart = selectedDayStart.getTime();
  const dayEnd = endOfDay(selectedDay).getTime();

  const rawStart = new Date(job.start);
  const appointmentEndMs = getAppointmentEndMs(job);

  const inSpan =
    isValid(rawStart) &&
    Number.isFinite(appointmentEndMs) &&
    rawStart.getTime() <= dayEnd &&
    appointmentEndMs >= dayStart;

  if (!inSpan) {
    return { plotStartMs: 0, plotEndMs: 0, inSpan: false };
  }

  const plotStartDate = new Date(selectedDayStart);
  plotStartDate.setHours(rawStart.getHours(), rawStart.getMinutes(), 0, 0);
  const plotStartMs = plotStartDate.getTime();

  const durationMs = getJobDailyWorkWindowMs(job);
  let plotEndMs = plotStartMs + durationMs;
  const nextCalendarDay = addDays(selectedDayStart, 1);
  const plotEndDate = new Date(plotEndMs);

  if (isSameDay(plotEndDate, selectedDayStart)) {
    const p = new Date(selectedDayStart);
    p.setHours(plotEndDate.getHours(), plotEndDate.getMinutes(), 0, 0);
    plotEndMs = p.getTime();
  } else if (isSameDay(plotEndDate, nextCalendarDay)) {
    const p = new Date(nextCalendarDay);
    p.setHours(plotEndDate.getHours(), plotEndDate.getMinutes(), 0, 0);
    plotEndMs = p.getTime();
  }

  return { plotStartMs, plotEndMs, inSpan: true };
}
