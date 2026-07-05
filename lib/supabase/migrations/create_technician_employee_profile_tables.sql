-- Migration: Create technician employee profile extension tables
-- Description: Stores AIFM-style technician employment, access, payroll, schedule, documents, and other details.

CREATE TABLE IF NOT EXISTS technician_employment_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    employee_type VARCHAR(100),
    job_title VARCHAR(255),
    department VARCHAR(255),
    hire_date DATE,
    original_hire_date DATE,
    adjusted_service_date DATE,
    release_date DATE,
    manager_supervisor VARCHAR(255),
    group_assignment VARCHAR(255),
    industry_start_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT technician_employment_details_technician_unique UNIQUE (technician_id)
);

CREATE TABLE IF NOT EXISTS technician_access_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    is_field_worker BOOLEAN DEFAULT true,
    access_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT technician_access_settings_technician_unique UNIQUE (technician_id)
);

CREATE TABLE IF NOT EXISTS technician_payroll_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    employee_id VARCHAR(100),
    nickname VARCHAR(255),
    regular_rate_hour NUMERIC(10, 2) DEFAULT 0,
    regular_rate_job NUMERIC(10, 2) DEFAULT 0,
    commission_rate NUMERIC(10, 4) DEFAULT 0,
    calculate_overtime VARCHAR(100),
    overtime1_starts_after NUMERIC(10, 2),
    overtime1_rate NUMERIC(10, 2) DEFAULT 0,
    overtime2_starts_after NUMERIC(10, 2),
    overtime2_rate NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT technician_payroll_profiles_technician_unique UNIQUE (technician_id)
);

CREATE TABLE IF NOT EXISTS technician_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    day_key VARCHAR(16) NOT NULL,
    shift_number SMALLINT NOT NULL CHECK (shift_number IN (1, 2)),
    start_time TIME,
    end_time TIME,
    is_working BOOLEAN DEFAULT true,
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS technician_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    document_type VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    document_number VARCHAR(255),
    expiration_date DATE,
    notify_before_expiry BOOLEAN DEFAULT false,
    storage_bucket VARCHAR(100) DEFAULT 'documents',
    storage_path TEXT,
    file_url TEXT,
    file_name VARCHAR(255),
    file_type VARCHAR(255),
    file_size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS technician_other_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    language_preference VARCHAR(100) DEFAULT 'English (US)',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT technician_other_details_technician_unique UNIQUE (technician_id)
);

CREATE INDEX IF NOT EXISTS idx_technician_employment_details_technician_id ON technician_employment_details(technician_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technician_access_settings_technician_id ON technician_access_settings(technician_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technician_payroll_profiles_technician_id ON technician_payroll_profiles(technician_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technician_schedules_technician_id ON technician_schedules(technician_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technician_schedules_day_shift ON technician_schedules(technician_id, day_of_week, shift_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technician_documents_technician_id ON technician_documents(technician_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technician_documents_expiration_date ON technician_documents(expiration_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technician_other_details_technician_id ON technician_other_details(technician_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'technician_employment_details',
        'technician_access_settings',
        'technician_payroll_profiles',
        'technician_schedules',
        'technician_documents',
        'technician_other_details'
    ]
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%1$s_updated_at ON %1$s;
            CREATE TRIGGER update_%1$s_updated_at
            BEFORE UPDATE ON %1$s
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', table_name);
    END LOOP;
END $$;

ALTER TABLE technician_employment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_access_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_payroll_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_other_details ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'technician_employment_details',
        'technician_access_settings',
        'technician_payroll_profiles',
        'technician_schedules',
        'technician_documents',
        'technician_other_details'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Users can view %1$s" ON %1$s;', table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Users can insert %1$s" ON %1$s;', table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Users can update %1$s" ON %1$s;', table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Users can delete %1$s" ON %1$s;', table_name);
        EXECUTE format('CREATE POLICY "Users can view %1$s" ON %1$s FOR SELECT USING (true);', table_name);
        EXECUTE format('CREATE POLICY "Users can insert %1$s" ON %1$s FOR INSERT WITH CHECK (true);', table_name);
        EXECUTE format('CREATE POLICY "Users can update %1$s" ON %1$s FOR UPDATE USING (true);', table_name);
        EXECUTE format('CREATE POLICY "Users can delete %1$s" ON %1$s FOR DELETE USING (true);', table_name);
    END LOOP;
END $$;

COMMENT ON TABLE technician_schedules IS 'Weekly employee schedule for technician availability and scheduler warnings';
COMMENT ON TABLE technician_documents IS 'Technician document metadata linked to Supabase Storage files';
