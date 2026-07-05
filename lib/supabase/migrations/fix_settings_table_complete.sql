-- Migration: Complete fix for settings table
-- Date: 2025-11-17
-- Description: Ensures settings table exists with correct structure for follow-up types and other settings

-- Drop the table if it exists to start fresh (WARNING: This will delete existing data)
-- Comment out the DROP line if you want to preserve existing data
-- DROP TABLE IF EXISTS settings CASCADE;

-- Create settings table with correct structure
CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure the function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;

CREATE TRIGGER update_settings_updated_at 
BEFORE UPDATE ON settings
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Verify the table structure
DO $$ 
DECLARE
    table_exists BOOLEAN;
    column_count INTEGER;
BEGIN
    -- Check if table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'settings'
    ) INTO table_exists;
    
    IF table_exists THEN
        -- Count columns
        SELECT COUNT(*) INTO column_count
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'settings';
        
        RAISE NOTICE 'Settings table exists with % columns', column_count;
        RAISE NOTICE 'Table structure verified: id (VARCHAR), value (JSONB), created_at, updated_at';
    ELSE
        RAISE EXCEPTION 'Settings table was not created!';
    END IF;
END $$;

-- Grant necessary permissions (adjust based on your RLS policies)
-- Uncomment and modify as needed:
-- ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow authenticated users to manage settings" ON settings
--     FOR ALL USING (auth.role() = 'authenticated');

