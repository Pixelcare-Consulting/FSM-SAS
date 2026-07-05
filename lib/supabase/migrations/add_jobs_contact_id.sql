-- Link jobs to primary contact person (FK to contacts)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_contact_id ON jobs(contact_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN jobs.contact_id IS 'FK to contacts — primary contact person for this job';
