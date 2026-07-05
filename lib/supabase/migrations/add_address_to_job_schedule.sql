-- Ensure job_schedule.address column exists.
-- This column stores the formatted service address for AIFM-imported jobs
-- (and any other jobs where a free-text address is needed without a locations FK).
-- Safe to run multiple times.

ALTER TABLE job_schedule
  ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN job_schedule.address IS
  'Free-text service address. Populated by AIFM import from the service_location object. '
  'Used as a display fallback when jobs.location_id is NULL.';
