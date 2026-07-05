-- =============================================
-- MIGRATION: Add Missing Columns to job_media Table
-- =============================================
-- This migration adds the missing columns to job_media table that are needed
-- for PDF generation and media file tracking.

-- Add filename column if it doesn't exist
ALTER TABLE job_media 
ADD COLUMN IF NOT EXISTS filename VARCHAR(255);

-- Add media_type column if it doesn't exist (to distinguish between images and PDFs)
ALTER TABLE job_media 
ADD COLUMN IF NOT EXISTS media_type VARCHAR(50) DEFAULT 'image';

-- Add updated_at column if it doesn't exist (for tracking updates)
ALTER TABLE job_media 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add index on media_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_job_media_media_type ON job_media(media_type) WHERE deleted_at IS NULL;

-- Add index on filename for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_media_filename ON job_media(filename) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON COLUMN job_media.filename IS 'Original filename of the media file';
COMMENT ON COLUMN job_media.media_type IS 'Type of media: image, pdf, video, etc.';
COMMENT ON COLUMN job_media.updated_at IS 'Timestamp when the record was last updated';

-- Create or replace trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS update_job_media_updated_at ON job_media;
CREATE TRIGGER update_job_media_updated_at
    BEFORE UPDATE ON job_media
    FOR EACH ROW
    EXECUTE FUNCTION update_job_media_updated_at();

