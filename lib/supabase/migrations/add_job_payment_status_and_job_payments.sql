-- Migration: Job payment status + received PayNow credits ledger
-- Tracks whether customer payment was received (manual mark-paid or bank webhook).

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'paid', 'partial', 'failed'));

COMMENT ON COLUMN jobs.payment_status IS 'Customer PayNow payment reconciliation status';

CREATE TABLE IF NOT EXISTS job_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    bank_reference VARCHAR(255),
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    raw_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_payments_job_id ON job_payments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_payments_paid_at ON job_payments(paid_at DESC);

-- Idempotent webhook / bank inserts when bank_reference is present
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_payments_source_bank_ref_unique
ON job_payments (source, bank_reference)
WHERE bank_reference IS NOT NULL;

COMMENT ON TABLE job_payments IS 'Received customer payments matched to jobs (manual or bank webhook)';
COMMENT ON COLUMN job_payments.source IS 'manual | dbs_inward_credit | sap_ar | other';
COMMENT ON COLUMN job_payments.amount_cents IS 'Payment amount in cents (SGD)';

DROP TRIGGER IF EXISTS update_job_payments_updated_at ON job_payments;
CREATE TRIGGER update_job_payments_updated_at
BEFORE UPDATE ON job_payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view job_payments" ON job_payments;
DROP POLICY IF EXISTS "Users can insert job_payments" ON job_payments;
DROP POLICY IF EXISTS "Users can update job_payments" ON job_payments;
DROP POLICY IF EXISTS "Users can delete job_payments" ON job_payments;

CREATE POLICY "Users can view job_payments" ON job_payments FOR SELECT USING (true);
CREATE POLICY "Users can insert job_payments" ON job_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update job_payments" ON job_payments FOR UPDATE USING (true);
CREATE POLICY "Users can delete job_payments" ON job_payments FOR DELETE USING (true);
