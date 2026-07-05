-- Purge soft-deleted technician_jobs when an active row exists for the same technician+job.
-- Example: job 000881b8-27e4-4582-bf19-1eccccb61f7f had 8 rows, 6 soft-deleted + 2 active.
--
-- Preview:
-- SELECT technician_id, job_id, COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
--        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted
-- FROM technician_jobs
-- GROUP BY technician_id, job_id
-- HAVING COUNT(*) > 1;

-- Optional filter:
-- AND tj.job_id = '000881b8-27e4-4582-bf19-1eccccb61f7f'

DELETE FROM technician_hours th
USING technician_jobs tj
WHERE th.technician_job_id = tj.id
  AND tj.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM technician_jobs active
    WHERE active.deleted_at IS NULL
      AND active.technician_id = tj.technician_id
      AND active.job_id = tj.job_id
  );

DELETE FROM technician_jobs tj
WHERE tj.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM technician_jobs active
    WHERE active.deleted_at IS NULL
      AND active.technician_id = tj.technician_id
      AND active.job_id = tj.job_id
  );
