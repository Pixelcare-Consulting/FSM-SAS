-- Migration: Add lead_id to customer table
-- Description: Links customers back to the originating lead
-- Date: 2026-01-07

ALTER TABLE customer
ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);

COMMENT ON COLUMN customer.lead_id IS 'Originating lead ID for customers created from leads';

-- Optional index to speed up lookups from lead -> customer
CREATE INDEX IF NOT EXISTS idx_customer_lead_id
ON customer(lead_id)
WHERE deleted_at IS NULL;


