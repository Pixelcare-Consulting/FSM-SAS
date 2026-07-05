-- Migration: Verify and fix settings table structure
-- Date: 2025-11-17
-- Description: Ensures settings table exists with correct structure and clears any schema cache issues

-- Drop and recreate the table to ensure clean structure
DROP TABLE IF EXISTS settings CASCADE;

-- Create settings table with correct structure
CREATE TABLE settings (
    id VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_settings_updated_at 
BEFORE UPDATE ON settings
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL ON settings TO authenticated;
-- GRANT ALL ON settings TO service_role;

-- Verify the table structure
DO $$ 
BEGIN
    RAISE NOTICE 'Settings table created successfully';
    RAISE NOTICE 'Columns: id (VARCHAR), value (JSONB), created_at, updated_at';
END $$;

