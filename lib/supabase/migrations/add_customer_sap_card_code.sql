-- Store SAP CardCode assigned when a portal CP customer was pushed to SAP (e.g. L00001)
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS sap_card_code VARCHAR(20);

COMMENT ON COLUMN customer.sap_card_code IS 'Last known SAP CardCode when portal CP was pushed to SAP (e.g. L00001)';
