-- Track which SAP company DB a customer was last verified/synced against
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS sap_sync_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sap_sync_environment VARCHAR(50);

COMMENT ON COLUMN customer.sap_sync_verified_at IS 'Last time portal verified this customer exists in the active SAP company DB';
COMMENT ON COLUMN customer.sap_sync_environment IS 'SAP_B1_COMPANY_DB value when customer was last synced/verified';
