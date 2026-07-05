-- Migration: Create google_forms table
-- Date: 2025-12-22
-- Description: Creates a dedicated table for managing Google Forms URLs with proper structure

-- Create google_forms table
CREATE TABLE IF NOT EXISTS google_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    form_id VARCHAR(255), -- Extracted form ID from URL for easier reference
    description TEXT, -- Optional description
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    -- Ensure URL is a valid Google Forms URL
    CONSTRAINT check_google_forms_url CHECK (url LIKE '%docs.google.com/forms%')
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_google_forms_active ON google_forms(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_google_forms_form_id ON google_forms(form_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_google_forms_created_at ON google_forms(created_at);
CREATE INDEX IF NOT EXISTS idx_google_forms_deleted_at ON google_forms(deleted_at) WHERE deleted_at IS NULL;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_google_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_google_forms_updated_at'
    ) THEN
        CREATE TRIGGER update_google_forms_updated_at 
        BEFORE UPDATE ON google_forms
        FOR EACH ROW 
        EXECUTE FUNCTION update_google_forms_updated_at();
    END IF;
END $$;

-- Add comment to table
COMMENT ON TABLE google_forms IS 'Stores Google Forms URLs for form submissions and integrations';
COMMENT ON COLUMN google_forms.name IS 'Display name for the Google Form';
COMMENT ON COLUMN google_forms.url IS 'Full URL to the Google Form';
COMMENT ON COLUMN google_forms.form_id IS 'Extracted form ID from the URL for easier reference';
COMMENT ON COLUMN google_forms.is_active IS 'Whether this form is currently active and being used';

