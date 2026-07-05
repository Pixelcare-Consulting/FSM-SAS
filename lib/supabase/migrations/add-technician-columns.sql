-- =============================================
-- MIGRATION: Add Missing Columns to Technicians Table
-- =============================================
-- This migration adds all the columns that are being used in the create worker form
-- but are missing from the technicians table schema.
-- Also updates users table to make password nullable (since we use Supabase Auth now).

-- Update users table: Make password nullable (passwords are now in Supabase Auth)
ALTER TABLE users 
ALTER COLUMN password DROP NOT NULL;

-- Personal Information Columns
ALTER TABLE technicians 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS middle_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS gender VARCHAR(20) CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS profile_picture TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Contact Information Columns
ALTER TABLE technicians 
ADD COLUMN IF NOT EXISTS primary_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS active_phone_1 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS active_phone_2 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS street_address TEXT,
ADD COLUMN IF NOT EXISTS state_province VARCHAR(255),
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);

-- Emergency Contact Columns
ALTER TABLE technicians 
ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS emergency_relationship VARCHAR(100);

-- Skills Column (stored as JSONB array)
ALTER TABLE technicians 
ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_technicians_first_name ON technicians(first_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technicians_last_name ON technicians(last_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technicians_gender ON technicians(gender) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_technicians_date_of_birth ON technicians(date_of_birth) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON COLUMN technicians.first_name IS 'First name of the technician';
COMMENT ON COLUMN technicians.middle_name IS 'Middle name of the technician';
COMMENT ON COLUMN technicians.last_name IS 'Last name of the technician';
COMMENT ON COLUMN technicians.gender IS 'Gender of the technician (MALE, FEMALE, OTHER)';
COMMENT ON COLUMN technicians.date_of_birth IS 'Date of birth of the technician';
COMMENT ON COLUMN technicians.profile_picture IS 'URL or path to profile picture';
COMMENT ON COLUMN technicians.bio IS 'Short biography or description of the technician';
COMMENT ON COLUMN technicians.primary_phone IS 'Primary phone number';
COMMENT ON COLUMN technicians.secondary_phone IS 'Secondary phone number';
COMMENT ON COLUMN technicians.active_phone_1 IS 'Whether primary phone is active';
COMMENT ON COLUMN technicians.active_phone_2 IS 'Whether secondary phone is active';
COMMENT ON COLUMN technicians.street_address IS 'Street address';
COMMENT ON COLUMN technicians.state_province IS 'State or province';
COMMENT ON COLUMN technicians.zip_code IS 'ZIP or postal code';
COMMENT ON COLUMN technicians.emergency_contact_name IS 'Name of emergency contact';
COMMENT ON COLUMN technicians.emergency_contact_phone IS 'Phone number of emergency contact';
COMMENT ON COLUMN technicians.emergency_relationship IS 'Relationship to emergency contact';
COMMENT ON COLUMN technicians.skills IS 'Array of skills stored as JSONB';

