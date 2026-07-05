-- Track when a portal customer was synced to SAP (so we can disable edit/sync again in UI)
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS synced_to_sap_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN customer.synced_to_sap_at IS 'When this customer was successfully synced to SAP (portal customers only).';
