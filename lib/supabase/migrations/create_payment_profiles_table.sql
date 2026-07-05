-- Migration: Create payment_profiles table for multi-bank PayNow/bank transfer
-- Date: 2025-03-19
-- Description: Allows different banks per job type; resolves DBS (PayNow) vs UOB (bank transfer) mismatch

CREATE TABLE IF NOT EXISTS payment_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(100) NOT NULL,
    pay_to VARCHAR(255),
    bank_name VARCHAR(255),
    account_no VARCHAR(100),
    paynow_uen VARCHAR(50),           -- Display on PDF (e.g. 201019107Z)
    paynow_uen_qr VARCHAR(80),       -- Full UEN+bank for QR (e.g. 201019107ZDBS)
    payment_instruction TEXT,
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Ensure only one default (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_profiles_default 
ON payment_profiles (is_default) WHERE is_default = true AND deleted_at IS NULL;

-- Trigger for updated_at (update_updated_at_column from fsm-schema or create_settings_table)
CREATE TRIGGER update_payment_profiles_updated_at 
BEFORE UPDATE ON payment_profiles 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add payment_profile_id to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payment_profile_id UUID REFERENCES payment_profiles(id) ON DELETE SET NULL;
COMMENT ON COLUMN jobs.payment_profile_id IS 'Selected payment profile (bank) for this job; null = use default profile';

-- Seed default profiles only if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_profiles LIMIT 1) THEN
    INSERT INTO payment_profiles (label, pay_to, bank_name, account_no, paynow_uen, paynow_uen_qr, payment_instruction, is_default, sort_order)
    VALUES 
      ('DBS (PayNow)', 'SAS M & E PTE LTD', 'DBS Bank', NULL, '201019107Z', '201019107ZDBS', 'Please quote job no in your reference.', true, 0),
      ('UOB (Bank Transfer)', 'SAS M & E PTE LTD', 'United Overseas Bank', '375-303-059-8', '201019107Z', '201019107ZUOB', 'Please quote job no in your reference.', false, 1);
  END IF;
END $$;
