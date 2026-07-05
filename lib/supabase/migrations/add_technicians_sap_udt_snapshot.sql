-- Denormalized snapshot from SAP U_JOB_INCENTIVES (UDT) after portal "Fetch from SAP".
-- Totals are summed across all UDT rows matched to the technician in the current payload.

ALTER TABLE technicians
ADD COLUMN IF NOT EXISTS sap_udt_total_income NUMERIC(14, 4) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS sap_udt_total_working_hrs NUMERIC(14, 4) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS sap_udt_snapshot_label TEXT,
ADD COLUMN IF NOT EXISTS sap_udt_snapshot_at TIMESTAMPTZ;

COMMENT ON COLUMN technicians.sap_udt_total_income IS 'Sum of U_Income from matched SAP incentive UDT rows at last sync';
COMMENT ON COLUMN technicians.sap_udt_total_working_hrs IS 'Sum of U_WorkingHrs from matched SAP incentive UDT rows at last sync';
COMMENT ON COLUMN technicians.sap_udt_snapshot_label IS 'e.g. period label from latest matched UDT row (U_JobMonth + U_Year)';
COMMENT ON COLUMN technicians.sap_udt_snapshot_at IS 'When incentive UDT values were last written from SAP';
