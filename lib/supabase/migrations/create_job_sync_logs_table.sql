-- Phase 2: Sync logs table for job ↔ SAP sync (create/update/hourly)
-- Used for debugging and audit of sync runs.

CREATE TABLE IF NOT EXISTS job_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('to_sap', 'from_sap')),
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'sync')),
    sap_activity_id VARCHAR(50),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failure', 'skipped')),
    request_payload JSONB,
    response_payload JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_sync_logs_job_id ON job_sync_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_sync_logs_created_at ON job_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_sync_logs_status ON job_sync_logs(status);

COMMENT ON TABLE job_sync_logs IS 'Phase 2: Log of job sync operations to/from SAP Activities';
