-- A job can be linked to another customer's service call while staying under its
-- own customer (contact, address, routing). Remember the call's owner so Edit Job
-- shows it and SAP sync books the Activity under the owner's CardCode (SAP only
-- links an Activity to a service call of the same business partner).
-- NULL = the service call belongs to the job's own customer.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS service_call_owner_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS service_call_owner_name VARCHAR(255);

COMMENT ON COLUMN jobs.service_call_owner_code IS
  'SAP CardCode of the service call owner when it differs from the job customer; used as the SAP Activity CardCode.';
COMMENT ON COLUMN jobs.service_call_owner_name IS
  'Name of the service call owner when it differs from the job customer.';
