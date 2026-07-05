-- =============================================
-- MIGRATION: Add City and Country Columns to Technicians Table
-- =============================================
-- This migration adds city and country columns to the technicians table
-- to support full address display matching the customer location format.

-- Add city and country columns to technicians table
ALTER TABLE technicians 
ADD COLUMN IF NOT EXISTS city VARCHAR(255),
ADD COLUMN IF NOT EXISTS country VARCHAR(10);

-- Comments for documentation
COMMENT ON COLUMN technicians.city IS 'City of the technician address';
COMMENT ON COLUMN technicians.country IS 'Country code of the technician address (e.g., SG, GB, US)';

