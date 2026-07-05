-- =============================================
-- MIGRATION: Add Color Column to Technicians Table
-- =============================================
-- This migration adds a color column to store technician colors
-- Note: The application currently uses localStorage for dynamic colors
-- This migration is optional if you want to store colors in the database

-- Add color column to technicians table
ALTER TABLE technicians 
ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT NULL;

-- Add comment to column
COMMENT ON COLUMN technicians.color IS 'Hex color code for technician display (e.g., #1aaa55)';

-- Create index for faster lookups (optional)
CREATE INDEX IF NOT EXISTS idx_technicians_color ON technicians(color) WHERE color IS NOT NULL;

