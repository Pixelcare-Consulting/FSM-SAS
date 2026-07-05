-- Phase 2: Add SAP Activity sync columns to jobs table
-- sap_activity_id: SAP Activity internal ID (from POST/PATCH response) for PATCH and sync validation
-- last_synced_at: Last successful sync to SAP (optional, for hourly sync and UI)

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS sap_activity_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN jobs.sap_activity_id IS 'SAP Service Layer Activity (Job) internal ID; used for PATCH and sync';
COMMENT ON COLUMN jobs.last_synced_at IS 'Last time this job was successfully synced to SAP';

CREATE INDEX IF NOT EXISTS idx_jobs_sap_activity_id ON jobs(sap_activity_id) WHERE sap_activity_id IS NOT NULL AND deleted_at IS NULL;
