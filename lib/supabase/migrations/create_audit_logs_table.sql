-- Migration: Create audit_logs table
-- Description: Full audit trail for portal actions — job updates, migrations, auth, SAP sync, etc.

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    entity_type VARCHAR(50),
    entity_id VARCHAR(255),
    entity_label VARCHAR(500),
    description TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'success'
        CHECK (status IN ('success', 'failure', 'warning', 'pending')),
    source VARCHAR(50) NOT NULL DEFAULT 'portal'
        CHECK (source IN ('portal', 'api', 'system', 'cron', 'migration')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);

COMMENT ON TABLE audit_logs IS 'Full audit trail: who did what, when — jobs, migrations, auth, SAP sync, settings';
COMMENT ON COLUMN audit_logs.user_id IS 'Portal users.id; NULL for system/cron actions';
COMMENT ON COLUMN audit_logs.changes IS 'Optional before/after snapshot for update actions';
COMMENT ON COLUMN audit_logs.details IS 'Structured context: payloads, counts, error info, etc.';
COMMENT ON COLUMN audit_logs.source IS 'Origin: portal UI, API route, cron job, migration tool';

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit logs" ON audit_logs
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs
    FOR INSERT WITH CHECK (true);
