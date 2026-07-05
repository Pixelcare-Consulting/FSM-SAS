-- Migration: job_email_log — idempotent send tracking for transactional job emails
-- Date: 2026-06-10
-- Description: Prevents duplicate job-completed (and future template) emails per job

CREATE TABLE IF NOT EXISTS job_email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  template_key VARCHAR(50) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_job_email_log_job_id ON job_email_log(job_id);
CREATE INDEX IF NOT EXISTS idx_job_email_log_template_key ON job_email_log(template_key);
