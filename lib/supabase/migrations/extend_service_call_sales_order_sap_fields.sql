-- Align service_call / sales_order with SAP sql10 / sql05 enrichment fields

ALTER TABLE service_call
  ADD COLUMN IF NOT EXISTS customer_name_sap VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sap_create_date DATE,
  ADD COLUMN IF NOT EXISTS sap_create_time VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sap_synced_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN service_call.customer_name_sap IS 'OSCL.custmrName from SAP sql10';
COMMENT ON COLUMN service_call.sap_create_date IS 'OSCL.createDate (YYYYMMDD) from SAP sql10';
COMMENT ON COLUMN service_call.sap_create_time IS 'OSCL.createTime (HHmm) from SAP sql10';
COMMENT ON COLUMN service_call.sap_synced_at IS 'Last successful enrich from SAP sql10';

ALTER TABLE sales_order
  ADD COLUMN IF NOT EXISTS sap_synced_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sap_found BOOLEAN DEFAULT false;

COMMENT ON COLUMN sales_order.sap_found IS 'True when sql05 returned a row for CardCode+ServiceCallID+DocNum';
COMMENT ON COLUMN sales_order.sap_synced_at IS 'Last sql05 lookup attempt';

CREATE INDEX IF NOT EXISTS idx_service_call_sap_synced_at ON service_call(sap_synced_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_order_sap_found ON sales_order(sap_found) WHERE deleted_at IS NULL;
