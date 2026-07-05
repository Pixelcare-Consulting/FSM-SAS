-- Migration: Add detailed fields to leads table to match Google Sheets columns
-- Date: 2026-01-05
-- Description: Adds separate columns for First Name, Last Name, Building, Street, Postcode, and Country
--              to match the exact structure from Google Forms responses

-- Add first_name and last_name columns (separate from full_name)
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);

-- Add detailed address components (separate from address field)
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS building VARCHAR(255),
ADD COLUMN IF NOT EXISTS street VARCHAR(255),
ADD COLUMN IF NOT EXISTS postcode VARCHAR(50),
ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- Add comments for documentation
COMMENT ON COLUMN leads.first_name IS 'First name from Google Form (separate from full_name)';
COMMENT ON COLUMN leads.last_name IS 'Last name from Google Form (separate from full_name)';
COMMENT ON COLUMN leads.building IS 'Building name/address component from Google Form';
COMMENT ON COLUMN leads.street IS 'Street address component from Google Form';
COMMENT ON COLUMN leads.postcode IS 'Postal code from Google Form';
COMMENT ON COLUMN leads.country IS 'Country from Google Form';

-- Optional: Create a function to automatically populate full_name from first_name + last_name
-- This can be used as a trigger or computed column if needed
CREATE OR REPLACE FUNCTION update_full_name_from_parts()
RETURNS TRIGGER AS $$
BEGIN
    -- If full_name is empty but first_name and last_name exist, combine them
    IF (NEW.full_name IS NULL OR NEW.full_name = '') AND 
       (NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL) THEN
        NEW.full_name := TRIM(CONCAT(COALESCE(NEW.first_name, ''), ' ', COALESCE(NEW.last_name, '')));
    END IF;
    
    -- If address is empty but building/street/postcode/country exist, combine them
    IF (NEW.address IS NULL OR NEW.address = '') AND 
       (NEW.building IS NOT NULL OR NEW.street IS NOT NULL OR NEW.postcode IS NOT NULL OR NEW.country IS NOT NULL) THEN
        NEW.address := TRIM(
            CONCAT_WS(', ',
                NULLIF(NEW.building, ''),
                NULLIF(NEW.street, ''),
                NULLIF(NEW.postcode, ''),
                NULLIF(NEW.country, '')
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-populate full_name and address from parts
DROP TRIGGER IF EXISTS trigger_update_full_name_from_parts ON leads;
CREATE TRIGGER trigger_update_full_name_from_parts
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_full_name_from_parts();

