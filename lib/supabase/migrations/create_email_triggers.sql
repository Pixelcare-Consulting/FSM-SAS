-- Migration: email_triggers registry (system + custom events)
-- Date: 2026-06-15
-- Description: Custom dynamic email events alongside hardcoded system triggers

CREATE TABLE IF NOT EXISTS email_triggers (
  trigger_id VARCHAR(64) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_triggers_system ON email_triggers(is_system);
CREATE INDEX IF NOT EXISTS idx_email_triggers_sort ON email_triggers(sort_order);

-- Seed system rows matching KNOWN_TRIGGERS (idempotent)
INSERT INTO email_triggers (trigger_id, label, description, is_system, sort_order)
VALUES
  ('job.assigned', 'Job assigned', 'Fires when a technician is assigned to a job', true, 10),
  ('job.completed', 'Job completed', 'Fires when a job is marked complete', true, 20),
  ('follow_up.created', 'Follow-up created', 'Fires when a follow-up is created', true, 30),
  ('follow_up.due', 'Follow-up due (scheduled)', 'Fires when a scheduled follow-up is due', true, 40)
ON CONFLICT (trigger_id) DO NOTHING;
