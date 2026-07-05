-- Add jobs.status column if it does not exist (fixes "column status does not exist" on update)
-- Run in Supabase SQL Editor for the SAME project as your app (check URL: vwgtfpksdpzxhvhuwlzl).
-- Use public.jobs so it works regardless of search_path.

-- Step 1: Add column (run this first; if it errors, the table may be in another schema)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';

-- Step 2: Drop existing status check constraint if present
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT c.conname FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE t.relname = 'jobs' AND n.nspname = 'public' AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) LIKE '%status%')
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Step 3: Add constraint with all allowed statuses (including CANCELLED)
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN (
    'PENDING', 'IN_PROGRESS', 'UPCOMING', 'OVERDUE', 'WAITING', 'COMPLETED', 'CANCELLED',
    'CREATED', 'SCHEDULED', 'RESCHEDULED', 'UNCONFIRMED', 'CONFIRMED'
  )
);

COMMENT ON COLUMN public.jobs.status IS 'Job status from Settings > Job Statuses; used by Create/Edit Job and Technician Scheduler.';
