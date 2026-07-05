-- =============================================
-- MIGRATION: Add Job Incentive Rate to Technicians
-- =============================================
-- Stores the hourly incentive rate used for per-job incentive calculations.

ALTER TABLE technicians
ADD COLUMN IF NOT EXISTS job_incentive_hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN technicians.job_incentive_hourly_rate IS 'Hourly job incentive rate used with technician_jobs labor time';
