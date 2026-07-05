-- Allow jobs.customer_id to be NULL.
-- This supports AIFM-imported jobs where no matching SAP Business Partner exists yet.
-- The AIFM customer name is stored inside the job description as [CUSTOMER:<name>]
-- so the record can be manually assigned to the correct customer later.

ALTER TABLE jobs
  ALTER COLUMN customer_id DROP NOT NULL;

COMMENT ON COLUMN jobs.customer_id IS
  'FK to customer. Nullable for AIFM-imported jobs that have no SAP CardCode match; '
  'search the job description for [CUSTOMER:<name>] to identify the intended customer.';
