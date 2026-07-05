-- Migration: Add avatar_url column to technicians table
-- Use avatar_url instead of profile_picture for consistency with mobile app
-- Run this if avatar_url doesn't exist yet

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'technicians' AND column_name = 'avatar_url') THEN
    ALTER TABLE technicians ADD COLUMN avatar_url TEXT;
    COMMENT ON COLUMN technicians.avatar_url IS 'URL to avatar image (Supabase Storage)';
  END IF;
END $$;
