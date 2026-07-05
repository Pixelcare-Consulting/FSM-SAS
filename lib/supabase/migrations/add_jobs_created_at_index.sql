-- Speed up default jobs list sort (created_at DESC) on non-deleted rows.
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC) WHERE deleted_at IS NULL;
