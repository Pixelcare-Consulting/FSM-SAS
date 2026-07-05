-- Link jobs to sales_order (AIFM job_po_number → SO# for SAP U_API_PONo)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES sales_order(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_sales_order_id ON jobs(sales_order_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN jobs.sales_order_id IS 'FK to sales_order; document_number typically from AIFM job_po_number (SAP SO#)';
