-- Migration: email template registry (templates, trigger bindings, overrides, versions)
-- Date: 2026-06-15
-- Description: Dynamic email template platform — system seeds + custom templates + trigger mapping

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'system',
  legacy_key VARCHAR(64),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  merge_field_schema JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_legacy_key ON email_templates(legacy_key) WHERE legacy_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS email_trigger_bindings (
  trigger_id VARCHAR(64) PRIMARY KEY,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_template_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  scope_type VARCHAR(32) NOT NULL,
  scope_id UUID NOT NULL,
  subject TEXT,
  body_html TEXT,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_email_template_overrides_scope ON email_template_overrides(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS email_template_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  version INT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version)
);

-- System template seeds (idempotent by slug)
INSERT INTO email_templates (slug, name, category, legacy_key, subject, body_html, merge_field_schema)
VALUES
  (
    'job_assigned',
    'Job assigned to technician',
    'system',
    'jobAssigned',
    'Job {{job_number}} assigned — {{job_title}}',
    'Hi {{technician_name}},

You''ve been assigned:
• Job: {{job_number}} — {{job_title}}
• Customer: {{customer_name}}
• Site: {{location_name}}
• Service location: {{service_location}}
• Contacts: {{contacts}}
• Scheduled: {{scheduled_date}}

Open in the app: {{job_url}}

Sent from {{company_name}}',
    '[]'::jsonb
  ),
  (
    'job_completed',
    'Job completed',
    'system',
    'jobCompleted',
    'Job {{job_number}} marked complete',
    'Hello {{customer_name}},

Job {{job_number}} ({{job_title}}) was completed on {{completed_at}}.

Technician: {{technician_name}}

Service location: {{service_location}}
Site: {{location_name}}
Contacts: {{contacts}}

Thank you for choosing {{company_name}}.',
    '[]'::jsonb
  ),
  (
    'follow_up_reminder',
    'Follow-up reminder',
    'system',
    'followUpReminder',
    'Reminder: {{follow_up_title}}',
    'Hi {{assignee_name}},

This is a reminder about: {{follow_up_title}}

• Related job: {{job_number}} — {{job_title}}
• Site: {{location_name}}
• Service location: {{service_location}}
• Contacts: {{contacts}}
• Due: {{due_date}}
{{notes_line}}

Open the follow-up: {{follow_up_url}}

— {{company_name}}',
    '[]'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO email_trigger_bindings (trigger_id, template_id, enabled)
SELECT 'job.assigned', t.id, true
FROM email_templates t WHERE t.slug = 'job_assigned'
ON CONFLICT (trigger_id) DO NOTHING;

INSERT INTO email_trigger_bindings (trigger_id, template_id, enabled)
SELECT 'job.completed', t.id, true
FROM email_templates t WHERE t.slug = 'job_completed'
ON CONFLICT (trigger_id) DO NOTHING;

INSERT INTO email_trigger_bindings (trigger_id, template_id, enabled)
SELECT 'follow_up.created', t.id, true
FROM email_templates t WHERE t.slug = 'follow_up_reminder'
ON CONFLICT (trigger_id) DO NOTHING;

INSERT INTO email_trigger_bindings (trigger_id, template_id, enabled)
SELECT 'follow_up.due', t.id, false
FROM email_templates t WHERE t.slug = 'follow_up_reminder'
ON CONFLICT (trigger_id) DO NOTHING;
