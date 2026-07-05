-- Diagnose inflated FSM labor hours (technician_jobs vs technician_hours cache).
-- Run in Supabase SQL editor. Read-only.
-- fn_compute_technician_labor_hours RETURN 0 paths are per-row business rules, not row LIMITs.

-- ---------------------------------------------------------------------------
-- Preview: top 30 raw timestamp spans (optional LIMIT for quick triage)
-- ---------------------------------------------------------------------------
SELECT
  tj.id,
  j.job_number,
  tj.assignment_status,
  tj.started_at,
  tj.completed_at,
  tj.accumulated_hours,
  j.scheduled_start,
  j.scheduled_end,
  EXTRACT(EPOCH FROM (tj.completed_at - tj.started_at)) / 3600.0 AS raw_span_h,
  th.labor_hours AS cached_h
FROM technician_jobs tj
JOIN jobs j ON j.id = tj.job_id
LEFT JOIN technician_hours th ON th.technician_job_id = tj.id
WHERE tj.deleted_at IS NULL AND j.deleted_at IS NULL
ORDER BY raw_span_h DESC NULLS LAST
LIMIT 30;

-- ---------------------------------------------------------------------------
-- Full scan: all assignments ranked by raw span (no LIMIT — 6000+ rows OK)
-- ---------------------------------------------------------------------------
-- SELECT
--   tj.id,
--   j.job_number,
--   tj.assignment_status,
--   tj.started_at,
--   tj.completed_at,
--   tj.accumulated_hours,
--   j.scheduled_start,
--   j.scheduled_end,
--   EXTRACT(EPOCH FROM (tj.completed_at - tj.started_at)) / 3600.0 AS raw_span_h,
--   th.labor_hours AS cached_h
-- FROM technician_jobs tj
-- JOIN jobs j ON j.id = tj.job_id
-- LEFT JOIN technician_hours th ON th.technician_job_id = tj.id
-- WHERE tj.deleted_at IS NULL AND j.deleted_at IS NULL
-- ORDER BY raw_span_h DESC NULLS LAST;

-- Corrupt candidates: started_at more than 7 days before job schedule (year-mismatch / stale)
-- Full scan — no LIMIT
SELECT
  tj.id,
  j.job_number,
  tj.assignment_status,
  tj.started_at,
  tj.completed_at,
  tj.accumulated_hours,
  j.scheduled_start,
  EXTRACT(EPOCH FROM (tj.completed_at - tj.started_at)) / 3600.0 AS raw_span_h,
  th.labor_hours AS cached_h
FROM technician_jobs tj
JOIN jobs j ON j.id = tj.job_id
LEFT JOIN technician_hours th ON th.technician_job_id = tj.id
WHERE tj.deleted_at IS NULL
  AND j.deleted_at IS NULL
  AND tj.started_at IS NOT NULL
  AND j.scheduled_start IS NOT NULL
  AND tj.started_at < j.scheduled_start - INTERVAL '7 days'
ORDER BY raw_span_h DESC NULLS LAST;

-- In-progress rows with completed_at set (e.g. #2026-002610 class bugs)
-- Full scan — no LIMIT
SELECT
  tj.id,
  j.job_number,
  tj.assignment_status,
  tj.started_at,
  tj.completed_at,
  th.labor_hours AS cached_h
FROM technician_jobs tj
JOIN jobs j ON j.id = tj.job_id
LEFT JOIN technician_hours th ON th.technician_job_id = tj.id
WHERE tj.deleted_at IS NULL
  AND j.deleted_at IS NULL
  AND UPPER(tj.assignment_status) <> 'COMPLETED'
  AND tj.completed_at IS NOT NULL
ORDER BY j.job_number;

-- Orphan technician_hours for non-completed assignments
-- Full scan — no LIMIT
SELECT
  th.id,
  th.technician_job_id,
  th.labor_hours,
  tj.assignment_status,
  j.job_number
FROM technician_hours th
JOIN technician_jobs tj ON tj.id = th.technician_job_id
JOIN jobs j ON j.id = tj.job_id
WHERE UPPER(tj.assignment_status) <> 'COMPLETED';
