-- Migration: Payroll foundation tables (periods, entries, disbursements)
-- Phase B scaffold — calculation engine not included.

CREATE TABLE IF NOT EXISTS payroll_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(255) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(32) DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT payroll_periods_date_range CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS payroll_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    hours_worked NUMERIC(10, 2) DEFAULT 0,
    job_commission NUMERIC(14, 4) DEFAULT 0,
    gross_pay NUMERIC(14, 4) DEFAULT 0,
    deductions NUMERIC(14, 4) DEFAULT 0,
    net_pay NUMERIC(14, 4) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT payroll_entries_period_technician_unique UNIQUE (payroll_period_id, technician_id)
);

CREATE TABLE IF NOT EXISTS payroll_disbursements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE SET NULL,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    disbursement_method VARCHAR(50) DEFAULT 'bank_transfer',
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    paid_at TIMESTAMP WITH TIME ZONE,
    bank_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON payroll_periods(period_start, period_end) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period_id ON payroll_entries(payroll_period_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_entries_technician_id ON payroll_entries(technician_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_disbursements_period_id ON payroll_disbursements(payroll_period_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_disbursements_technician_id ON payroll_disbursements(technician_id) WHERE deleted_at IS NULL;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'payroll_periods',
        'payroll_entries',
        'payroll_disbursements'
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

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_disbursements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'payroll_periods',
        'payroll_entries',
        'payroll_disbursements'
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

COMMENT ON TABLE payroll_periods IS 'Payroll pay periods for technician compensation runs';
COMMENT ON TABLE payroll_entries IS 'Per-technician payroll line items for a pay period';
COMMENT ON TABLE payroll_disbursements IS 'Outbound payroll payouts to technicians';
