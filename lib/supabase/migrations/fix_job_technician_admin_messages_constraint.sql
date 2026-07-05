-- Fix the check_message_or_image constraint on job_technician_admin_messages table
-- This ensures the constraint properly allows either message or image_url

-- First, add image_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_technician_admin_messages' AND column_name = 'image_url') THEN
        ALTER TABLE job_technician_admin_messages ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- Make message column nullable if it's currently NOT NULL
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'job_technician_admin_messages' 
               AND column_name = 'message' 
               AND is_nullable = 'NO') THEN
        ALTER TABLE job_technician_admin_messages ALTER COLUMN message DROP NOT NULL;
    END IF;
END $$;

-- Drop the existing constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_message_or_image') THEN
        ALTER TABLE job_technician_admin_messages DROP CONSTRAINT check_message_or_image;
    END IF;
END $$;

-- Add the corrected constraint
-- This allows either message (non-empty) OR image_url (non-empty)
ALTER TABLE job_technician_admin_messages 
ADD CONSTRAINT check_message_or_image CHECK (
    (message IS NOT NULL AND message != '') OR 
    (image_url IS NOT NULL AND image_url != '')
);

