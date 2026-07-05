-- Expand jobs.status to allow Settings-driven values (Unconfirmed, Confirmed, Created, Scheduled, etc.)
-- so that Job Status from Settings > Job Statuses persists and reflects in Technician Scheduler.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT c.conname FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'jobs' AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) LIKE '%status%')
  LOOP
    EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN (
    'PENDING', 'IN_PROGRESS', 'UPCOMING', 'OVERDUE', 'WAITING', 'COMPLETED', 'CANCELLED',
    'CREATED', 'SCHEDULED', 'RESCHEDULED', 'UNCONFIRMED', 'CONFIRMED'
  )
);

COMMENT ON COLUMN jobs.status IS 'Job status from Settings > Job Statuses; used by Create/Edit Job and Technician Scheduler.';
