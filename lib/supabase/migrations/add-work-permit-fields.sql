-- =============================================
-- MIGRATION: Add Work Permit Fields to Technicians Table
-- =============================================
-- This migration adds NRIC/FIN/Work Permit Number and Work Permit Expiry Date
-- fields to the technicians table.

-- Add Work Permit Information Columns
ALTER TABLE technicians 
ADD COLUMN IF NOT EXISTS nric_fin_work_permit_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS work_permit_expiry_date DATE;

-- Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_technicians_nric_fin_work_permit_number ON technicians(nric_fin_work_permit_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technicians_work_permit_expiry_date ON technicians(work_permit_expiry_date) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON COLUMN technicians.nric_fin_work_permit_number IS 'NRIC/FIN/Work Permit Number of the technician';
COMMENT ON COLUMN technicians.work_permit_expiry_date IS 'Work Permit Expiry Date of the technician';
