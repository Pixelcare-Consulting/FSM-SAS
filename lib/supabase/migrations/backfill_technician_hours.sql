-- =============================================
-- ONE-SHOT: Backfill technician_hours from technician_jobs
-- =============================================
-- Run in Supabase SQL editor AFTER fix_technician_hours_trigger.sql.
-- Requires fn_compute_technician_labor_hours and fn_technician_hours_period_anchor.

-- Remove cached rows for non-completed assignments (orphan / stale cache)
DELETE FROM technician_hours th
USING technician_jobs tj
WHERE th.technician_job_id = tj.id
  AND UPPER(tj.assignment_status) <> 'COMPLETED';

-- Upsert labor_hours for ALL completed assignments (no LIMIT — full-table backfill).
-- Safe at 6000+ jobs: single INSERT…SELECT over technician_jobs + jobs.
INSERT INTO technician_hours (
  technician_job_id, technician_id, labor_hours, period_anchor_at, computed_at
)
SELECT
  tj.id,
  tj.technician_id,
  fn_compute_technician_labor_hours(
    tj.started_at, tj.completed_at, tj.accumulated_hours,
    tj.assignment_status, j.scheduled_start, j.scheduled_end
  ),
  fn_technician_hours_period_anchor(tj.completed_at, tj.assignment_status),
  NOW()
FROM technician_jobs tj
JOIN jobs j ON j.id = tj.job_id
WHERE tj.deleted_at IS NULL
  AND j.deleted_at IS NULL
  AND UPPER(tj.assignment_status) = 'COMPLETED'
  AND fn_technician_hours_period_anchor(tj.completed_at, tj.assignment_status) IS NOT NULL
ON CONFLICT (technician_job_id) DO UPDATE SET
  labor_hours      = EXCLUDED.labor_hours,
  period_anchor_at = EXCLUDED.period_anchor_at,
  computed_at      = EXCLUDED.computed_at;
