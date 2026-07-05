-- Migration: Add notes and due_date columns to followups table
-- Date: 2025-11-17
-- Description: Adds missing notes and due_date columns to support follow-up creation

-- Add notes column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'followups' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE followups ADD COLUMN notes TEXT;
        RAISE NOTICE 'Added notes column to followups table';
    ELSE
        RAISE NOTICE 'notes column already exists in followups table';
    END IF;
END $$;

-- Add due_date column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'followups' 
        AND column_name = 'due_date'
    ) THEN
        ALTER TABLE followups ADD COLUMN due_date TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added due_date column to followups table';
    ELSE
        RAISE NOTICE 'due_date column already exists in followups table';
    END IF;
END $$;

