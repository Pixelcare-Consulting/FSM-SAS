-- Migration: Add status_updated_by_account column to followups table
-- Date: 2026-04-16
-- Description: Stores the portal account label used for the last follow-up status change

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'followups'
        AND column_name = 'status_updated_by_account'
    ) THEN
        ALTER TABLE followups
        ADD COLUMN status_updated_by_account TEXT;

        RAISE NOTICE 'Added status_updated_by_account column to followups table';
    ELSE
        RAISE NOTICE 'status_updated_by_account column already exists in followups table';
    END IF;
END $$;
