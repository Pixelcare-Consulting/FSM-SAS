-- Migration: Create recent_activities table
-- Date: 2025-01-XX
-- Description: Creates recent_activities table to store activity logs for workers and system events

-- Create the recent_activities table
CREATE TABLE IF NOT EXISTS recent_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    type VARCHAR(50) DEFAULT 'session_management',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_recent_activities_worker_id ON recent_activities(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recent_activities_timestamp ON recent_activities(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_recent_activities_action ON recent_activities(action);
CREATE INDEX IF NOT EXISTS idx_recent_activities_type ON recent_activities(type);

-- Add comment to table
COMMENT ON TABLE recent_activities IS 'Stores activity logs for workers and system events';
COMMENT ON COLUMN recent_activities.worker_id IS 'Reference to users table. NULL for system-level activities';
COMMENT ON COLUMN recent_activities.action IS 'Description of the action performed';
COMMENT ON COLUMN recent_activities.details IS 'Additional details stored as JSONB';
COMMENT ON COLUMN recent_activities.type IS 'Type of activity (e.g., session_management, user_action, etc.)';
COMMENT ON COLUMN recent_activities.timestamp IS 'When the activity occurred';

-- Enable RLS (Row Level Security)
ALTER TABLE recent_activities ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all recent activities
CREATE POLICY "Users can view recent activities" ON recent_activities
  FOR SELECT USING (true);

-- Policy: Users can insert recent activities
CREATE POLICY "Users can insert recent activities" ON recent_activities
  FOR INSERT WITH CHECK (true);

-- Policy: Users can update recent activities (for corrections)
CREATE POLICY "Users can update recent activities" ON recent_activities
  FOR UPDATE USING (true);

-- Policy: Users can delete recent activities (for cleanup)
CREATE POLICY "Users can delete recent activities" ON recent_activities
  FOR DELETE USING (true);

