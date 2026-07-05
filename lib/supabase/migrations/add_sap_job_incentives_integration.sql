-- SAP Job Incentives add-on integration (FSM_SAP_JobIncentives_Mapping.pdf)
-- Part 3A: technicians.sap_tech_code — join key for @API_JOB_SCHEDULE.U_JobTech and SP results Tech column

ALTER TABLE technicians
ADD COLUMN IF NOT EXISTS sap_tech_code VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_technicians_sap_tech_code
  ON technicians (sap_tech_code)
  WHERE sap_tech_code IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN technicians.sap_tech_code IS 'SAP technician code (e.g. A1EdsonBeh); must match @API_JOB_SCHEDULE.U_JobTech';

-- Part 3B: jobs fields for SCL5 push / incentive income

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS sap_cm_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS sap_cm_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS sap_job_income NUMERIC(14, 4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN jobs.sap_cm_number IS 'Credit memo document number from SAP (SCL5.U_CMNumber)';
COMMENT ON COLUMN jobs.sap_cm_status IS 'WCM = With Credit Memo, WOCM = Without (SCL5.U_CMStatus)';
COMMENT ON COLUMN jobs.sap_job_income IS 'Incentive income for this job line (SCL5.U_JobIncome)';

-- Part 3C (optional): cache SAP stored procedure results

CREATE TABLE IF NOT EXISTS job_incentive_results (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  sap_tech_code VARCHAR(100) NOT NULL,
  year SMALLINT NOT NULL,
  month SMALLINT NOT NULL,
  income NUMERIC(14, 4) DEFAULT 0,
  expense NUMERIC(14, 4) DEFAULT 0,
  working_hrs NUMERIC(14, 4) DEFAULT 0,
  income_per_dollar NUMERIC(14, 6) DEFAULT 0,
  income_per_hour NUMERIC(14, 6) DEFAULT 0,
  fetched_from_sap_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT job_incentive_results_pkey PRIMARY KEY (id),
  CONSTRAINT job_incentive_results_tech_period UNIQUE (technician_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_job_incentive_results_period
  ON job_incentive_results (year DESC, month DESC);

CREATE TABLE IF NOT EXISTS job_incentive_detail_results (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  job_incentive_result_id UUID NOT NULL REFERENCES job_incentive_results(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  document_type VARCHAR(40),
  document_date DATE,
  document_entry VARCHAR(80),
  document_number VARCHAR(100),
  bp_code VARCHAR(50),
  bp_name VARCHAR(255),
  document_amount NUMERIC(14, 4) DEFAULT 0,
  incentive_amount NUMERIC(14, 4) DEFAULT 0,
  fetched_from_sap_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT job_incentive_detail_results_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_job_incentive_detail_results_parent
  ON job_incentive_detail_results (job_incentive_result_id);
