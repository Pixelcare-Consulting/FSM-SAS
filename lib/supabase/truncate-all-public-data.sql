-- =============================================================================
-- TRUNCATE APPLICATION DATA — preserve selected tables
-- =============================================================================
-- Deletes all rows from every public table EXCEPT those in `preserve_tables`.
-- Table definitions, indexes, RLS, and triggers are unchanged.
-- Does NOT touch auth.users or Storage buckets.
--
-- How to run: Supabase Dashboard → SQL Editor → paste and execute.
--
-- FOREIGN KEY NOTE:
-- If this errors with dependency/truncate messages, a preserved table still
-- references one you are clearing. Common cases in this schema:
--   - `leads` → `customer`  : cannot truncate `customer` while keeping `leads`
--   - `job_category` → `jobs` : cannot truncate `jobs` while keeping `job_category`
-- Fix: remove that table from `preserve_tables` above, or also preserve parent tables
-- you need referenced rows for (e.g. keep `jobs`/`customer` if you keep those children).
-- =============================================================================

DO $$
DECLARE
  stmt text;
  preserve_tables text[] := ARRAY[
    'technicians',
    'users',
    'company_details',
    'google_forms',
    'job_category',
    'leads',
    'scheduling_windows',
    'settings',
    'payment_profiles'
  ];
BEGIN
  SELECT 'TRUNCATE TABLE '
    || string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
    || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT c.relispartition
    AND c.relname NOT IN ('spatial_ref_sys')
    AND NOT (c.relname = ANY (preserve_tables));

  IF stmt IS NULL THEN
    RAISE NOTICE 'No tables to truncate (all public tables are in the preserve list).';
  ELSE
    RAISE NOTICE 'Executing: %', stmt;
    EXECUTE stmt;
    RAISE NOTICE 'Truncation complete (preserved: %).', array_to_string(preserve_tables, ', ');
  END IF;
END $$;

-- Optional: full auth wipe (commented). Dashboard → Authentication is often safer.
-- DELETE FROM auth.identities;
-- DELETE FROM auth.sessions;
-- DELETE FROM auth.users;
