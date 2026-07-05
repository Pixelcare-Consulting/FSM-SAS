/**
 * AIFM job start/end and estimated duration helpers.
 * Appointment window (job_end_date/time) is stored on jobs.scheduled_end / job_schedule.jetime.
 * Estimated duration is stored separately on job_schedule.dur (may be shorter than the slot).
 */

/**
 * Build ISO timestamp from separate AIFM date + time strings.
 * AIFM dates look like "2026-03-31", times like "13:00" or "13:00:00".
 */
export function parseAifmDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const rawTime = (timeStr || '').toString().trim();
  const normalizedTime =
    rawTime && rawTime.split(':').length === 2 ? `${rawTime}:00` : rawTime || '00:00:00';
  const combined = rawTime ? `${dateStr}T${normalizedTime}` : `${dateStr}T00:00:00`;
  const d = new Date(combined);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Estimated work length in minutes from AIFM `estimated_duration_hrs` + `estimated_duration_minutes`. */
export function parseAifmEstimatedDurationMinutes(job) {
  if (!job || typeof job !== 'object') return 0;
  const hrs = parseInt(job.estimated_duration_hrs ?? 0, 10) || 0;
  const mins = parseInt(job.estimated_duration_minutes ?? 0, 10) || 0;
  return hrs * 60 + mins;
}

/** Decimal hours for `job_schedule.dur` (e.g. "2.00"). */
export function aifmDurationDecimalHours(job) {
  const totalMinutes = parseAifmEstimatedDurationMinutes(job);
  return (totalMinutes / 60).toFixed(2);
}

/**
 * Appointment slot end for FSM (scheduler list/calendar window).
 * Uses AIFM job_end_date/time when present (e.g. 3pm–5pm, 9am–12pm).
 * Falls back to start + estimated duration only when AIFM sends no end time.
 */
export function computeAifmWorkEndIso(job) {
  const endFromAifm = parseAifmDateTime(job?.job_end_date, job?.job_end_time);
  if (endFromAifm) return endFromAifm;

  const startIso = parseAifmDateTime(job?.job_start_date, job?.job_start_time);
  const durationMinutes = parseAifmEstimatedDurationMinutes(job);
  if (startIso && durationMinutes > 0) {
    const start = new Date(startIso);
    if (!Number.isNaN(start.getTime())) {
      return new Date(start.getTime() + durationMinutes * 60 * 1000).toISOString();
    }
  }

  return null;
}

/** Sort key for job-number assignment: earliest scheduled start first; missing dates last. */
export function aifmJobScheduledStartMs(job) {
  const iso = parseAifmDateTime(job?.job_start_date, job?.job_start_time);
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

/**
 * Order jobs so sequential YYYY-XXXXXX numbers follow scheduled_start (not AIFM id / API page order).
 */
export function sortAifmJobsForJobNumberAssignment(jobs) {
  return [...jobs].sort((a, b) => {
    const diff = aifmJobScheduledStartMs(a) - aifmJobScheduledStartMs(b);
    if (diff !== 0) return diff;
    const idA = Number(a?.id);
    const idB = Number(b?.id);
    if (!Number.isNaN(idA) && !Number.isNaN(idB) && idA !== idB) return idA - idB;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
}
