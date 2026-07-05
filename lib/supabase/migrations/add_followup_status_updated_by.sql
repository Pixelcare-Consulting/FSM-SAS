-- Migration: Add status_updated_by column to followups table
-- Date: 2026-04-16
-- Description: Tracks the user who last changed follow-up status so the job view can show the CSO in "Attended By"

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'followups'
        AND column_name = 'status_updated_by'
    ) THEN
        ALTER TABLE followups
        ADD COLUMN status_updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

        RAISE NOTICE 'Added status_updated_by column to followups table';
    ELSE
        RAISE NOTICE 'status_updated_by column already exists in followups table';
    END IF;
END $$;
