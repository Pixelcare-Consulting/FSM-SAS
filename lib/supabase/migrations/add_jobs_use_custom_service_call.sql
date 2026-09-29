-- Remember when a job's Service Call / Sales Order numbers were typed by hand
-- ("Custom" checkbox in Create/Edit Job) instead of picked from SAP, so Edit Job
-- reopens with the checkbox ticked and the free-text fields showing.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS use_custom_service_call BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN jobs.use_custom_service_call IS
  'True when the service call / sales order were entered manually (Custom) rather than selected from SAP.';
