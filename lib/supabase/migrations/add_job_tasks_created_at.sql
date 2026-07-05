-- =============================================
-- MIGRATION: Add created_at to job_tasks
-- =============================================
-- Records when a task row was first created. Legacy rows remain NULL.
-- Two-step add: column without DEFAULT first so existing rows stay NULL,
-- then SET DEFAULT so only new inserts get NOW().

ALTER TABLE job_tasks
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE job_tasks
  ALTER COLUMN created_at SET DEFAULT NOW();

COMMENT ON COLUMN job_tasks.created_at IS
  'When this task row was first created. NULL for legacy rows before this column existed.';
