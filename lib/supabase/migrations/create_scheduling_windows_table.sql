-- Migration: Create scheduling_windows table
-- Date: 2025-11-17
-- Description: Creates scheduling_windows table to store time slot configurations

-- Create scheduling_windows table if it doesn't exist
CREATE TABLE IF NOT EXISTS scheduling_windows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(255) NOT NULL,
    time_start TIME NOT NULL,
    time_end TIME NOT NULL,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_scheduling_windows_deleted_at ON scheduling_windows(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduling_windows_time_start ON scheduling_windows(time_start) WHERE deleted_at IS NULL;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
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
        WHERE tgname = 'update_scheduling_windows_updated_at'
    ) THEN
        CREATE TRIGGER update_scheduling_windows_updated_at 
        BEFORE UPDATE ON scheduling_windows
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

