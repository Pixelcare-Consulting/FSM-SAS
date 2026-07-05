-- Company calendar events: holidays, company day-offs, and technician leave

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('company', 'technician')),
    technician_id UUID REFERENCES technicians(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (
        event_type IN ('holiday', 'company_day_off', 'leave', 'medical', 'other')
    ),
    title VARCHAR(500) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT true,
    start_time TIME,
    end_time TIME,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT calendar_events_date_range CHECK (end_date >= start_date),
    CONSTRAINT calendar_events_scope_technician CHECK (
        (scope = 'company' AND technician_id IS NULL)
        OR (scope = 'technician' AND technician_id IS NOT NULL)
    ),
    CONSTRAINT calendar_events_company_types CHECK (
        scope <> 'company'
        OR event_type IN ('holiday', 'company_day_off')
    ),
    CONSTRAINT calendar_events_technician_types CHECK (
        scope <> 'technician'
        OR event_type IN ('leave', 'medical', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range
    ON calendar_events (start_date, end_date)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_technician_start
    ON calendar_events (technician_id, start_date)
    WHERE deleted_at IS NULL AND technician_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_scope
    ON calendar_events (scope)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_events_select_authenticated" ON calendar_events;
CREATE POLICY "calendar_events_select_authenticated" ON calendar_events
    FOR SELECT
    TO anon, authenticated
    USING (deleted_at IS NULL);

COMMENT ON TABLE calendar_events IS 'Company holidays/day-offs and technician leave (Singapore calendar dates)';
