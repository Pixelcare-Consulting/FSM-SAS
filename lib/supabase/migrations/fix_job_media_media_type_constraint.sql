-- =============================================
-- MIGRATION: Fix job_media media_type CHECK Constraint
-- =============================================
-- This migration fixes the constraint violation issue when uploading images.
-- It drops any existing CHECK constraints on media_type column and adds the correct one.

-- Drop any existing CHECK constraints on media_type column
-- This handles constraints with any name (including job_images_media_type_check)
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find and drop all CHECK constraints that reference the media_type column
    -- This checks both by name pattern and by actual column reference
    FOR constraint_name IN 
        SELECT DISTINCT conname 
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid
        WHERE c.conrelid = 'job_media'::regclass
        AND c.contype = 'c'
        AND a.attname = 'media_type'
        AND a.attnum = ANY(c.conkey)
        UNION
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'job_media'::regclass
        AND contype = 'c'
        AND conname LIKE '%media_type%'
    LOOP
        EXECUTE format('ALTER TABLE job_media DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END LOOP;
END $$;

-- Ensure media_type column exists (should already exist, but safe to check)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'job_media' AND column_name = 'media_type'
    ) THEN
        ALTER TABLE job_media ADD COLUMN media_type VARCHAR(50) DEFAULT 'image';
    END IF;
END $$;

-- Fix any existing invalid data before adding the constraint
-- Set NULL, empty strings, or invalid values to 'image' (the default)
DO $$ 
DECLARE
    invalid_count INTEGER;
BEGIN
    -- Update NULL values to 'image'
    UPDATE job_media 
    SET media_type = 'image' 
    WHERE media_type IS NULL;
    
    -- Update empty strings to 'image'
    UPDATE job_media 
    SET media_type = 'image' 
    WHERE media_type = '';
    
    -- Update any values that don't match allowed types to 'image'
    -- This handles case sensitivity issues or typos
    UPDATE job_media 
    SET media_type = 'image' 
    WHERE media_type IS NOT NULL 
    AND media_type != ''
    AND LOWER(TRIM(media_type)) NOT IN ('image', 'pdf', 'video', 'document');
    
    -- Get count of remaining invalid rows for reporting
    SELECT COUNT(*) INTO invalid_count
    FROM job_media
    WHERE media_type IS NOT NULL 
    AND media_type != ''
    AND LOWER(TRIM(media_type)) NOT IN ('image', 'pdf', 'video', 'document');
    
    IF invalid_count > 0 THEN
        RAISE NOTICE 'Warning: % rows still have invalid media_type values', invalid_count;
    END IF;
END $$;

-- Normalize existing valid values to lowercase (handle case sensitivity)
UPDATE job_media 
SET media_type = LOWER(TRIM(media_type))
WHERE media_type IS NOT NULL 
AND LOWER(TRIM(media_type)) IN ('image', 'pdf', 'video', 'document')
AND media_type != LOWER(TRIM(media_type));

-- Add the correct CHECK constraint with explicit name
-- This constraint allows: 'image', 'pdf', 'video', 'document'
ALTER TABLE job_media 
DROP CONSTRAINT IF EXISTS job_media_media_type_check;

ALTER TABLE job_media 
ADD CONSTRAINT job_media_media_type_check 
CHECK (media_type IN ('image', 'pdf', 'video', 'document'));

-- Add comment for documentation
COMMENT ON CONSTRAINT job_media_media_type_check ON job_media IS 
'Ensures media_type is one of: image, pdf, video, document';

