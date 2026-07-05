-- Allow jobs.status to store SAP U_JobStatusID (numeric strings e.g. 554, 555, -5).
-- Drop existing status check so we can store values from U_API_JOB_STATUS.

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

-- Optional: widen column if needed for longer IDs (e.g. 3 digits + minus)
ALTER TABLE jobs ALTER COLUMN status TYPE VARCHAR(32);

COMMENT ON COLUMN jobs.status IS 'Job status: SAP U_JobStatusID (e.g. 554, 555, -5) from U_API_JOB_STATUS, or legacy text (PENDING, CREATED, etc.).';
