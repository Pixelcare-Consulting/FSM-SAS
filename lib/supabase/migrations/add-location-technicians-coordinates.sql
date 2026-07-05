-- =============================================
-- MIGRATION: Add Location Coordinates to location_technicians Table
-- =============================================
-- This migration adds location coordinate columns to the location_technicians table
-- to track actual technician GPS coordinates (current and destination)

-- Add location coordinate columns to location_technicians table
ALTER TABLE location_technicians 
ADD COLUMN IF NOT EXISTS current_longitude VARCHAR(50),
ADD COLUMN IF NOT EXISTS current_latitude VARCHAR(50),
ADD COLUMN IF NOT EXISTS destination_longitude VARCHAR(50),
ADD COLUMN IF NOT EXISTS destination_latitude VARCHAR(50);

-- Add index on tracked_at for faster queries (get latest location per technician)
CREATE INDEX IF NOT EXISTS idx_location_technicians_tracked_at_desc ON location_technicians(tracked_at DESC);

-- Add index on technician_id and tracked_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_location_technicians_tech_tracked ON location_technicians(technician_id, tracked_at DESC);

-- Comments for documentation
COMMENT ON COLUMN location_technicians.current_longitude IS 'Current longitude coordinate of the technician';
COMMENT ON COLUMN location_technicians.current_latitude IS 'Current latitude coordinate of the technician';
COMMENT ON COLUMN location_technicians.destination_longitude IS 'Destination longitude coordinate for the technician';
COMMENT ON COLUMN location_technicians.destination_latitude IS 'Destination latitude coordinate for the technician';

