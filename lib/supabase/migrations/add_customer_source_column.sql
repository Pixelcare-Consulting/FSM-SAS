-- Migration: Add source to customer table for generic (portal) vs SAP-synced
-- portal = created/managed in portal (Supabase only)
-- sap = synced from or created in SAP
-- NULL = legacy/existing (treated as non-generic for listing)

ALTER TABLE customer
ADD COLUMN IF NOT EXISTS source VARCHAR(20)
CHECK (source IS NULL OR source IN ('portal', 'sap'));

COMMENT ON COLUMN customer.source IS 'portal = portal-only customer, sap = from SAP; NULL = legacy';

CREATE INDEX IF NOT EXISTS idx_customer_source
ON customer(source)
WHERE deleted_at IS NULL AND source IS NOT NULL;
