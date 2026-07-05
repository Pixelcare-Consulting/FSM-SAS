-- Allow leads.status to include 'Portal' (portal-only customers / leads marked as Portal).
-- Run in Supabase SQL Editor for the same project as your app.
-- Without this, saving "Portal" in Edit Lead fails due to CHECK constraint.

-- Step 1: Drop existing leads status check constraint if present
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT c.conname FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE t.relname = 'leads' AND n.nspname = 'public' AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) LIKE '%status%')
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Step 2: Add constraint with all allowed statuses (including Portal)
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (
  status IN (
    'PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED', 'COMPLETED', 'Portal'
  )
);

COMMENT ON COLUMN public.leads.status IS 'Lead status: PENDING, CONTACTED, CONVERTED, REJECTED, COMPLETED, or Portal (portal-only).';
