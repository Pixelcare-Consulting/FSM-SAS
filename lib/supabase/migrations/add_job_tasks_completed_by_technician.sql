-- =============================================
-- MIGRATION: Who completed each job task (checklist row)
-- =============================================
-- Denormalized link to the technician who marked this task complete in the field app / portal.
-- Per-assignment audit with notes and timestamps remains in task_completions.

ALTER TABLE job_tasks
ADD COLUMN IF NOT EXISTS completed_by_technician_id UUID REFERENCES technicians(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_tasks_completed_by_technician_id
  ON job_tasks(completed_by_technician_id)
  WHERE completed_by_technician_id IS NOT NULL;

COMMENT ON COLUMN job_tasks.completed_by_technician_id IS
  'Technician who completed this checklist task (technicians.id). Use task_completions for per job-assignment records.';
