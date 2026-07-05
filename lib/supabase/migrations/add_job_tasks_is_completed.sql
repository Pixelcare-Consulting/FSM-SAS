-- =============================================
-- MIGRATION: Add is_completed to job_tasks
-- =============================================
-- Optional job-level task checklist flag (portal + field app).
-- Per-technician audit trail remains in task_completions.

ALTER TABLE job_tasks
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN job_tasks.is_completed IS
  'When true, the task is marked done at the job-task level (e.g. field app). NULL/false = not completed. Use task_completions for per-assignment audit.';
