-- Add admin_id column to job_technician_admin_messages to track which admin sent each message.
-- admin_id = the user who was logged in and sent the message (NOT job created_by).
-- Existing rows are left with admin_id NULL (we cannot know who sent them).
--
-- If you previously ran a backfill that set admin_id = job.created_by, clear it with:
--   UPDATE job_technician_admin_messages SET admin_id = NULL WHERE sender_type = 'ADMIN';

-- 1. Add admin_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_technician_admin_messages' AND column_name = 'admin_id'
    ) THEN
        ALTER TABLE job_technician_admin_messages
        ADD COLUMN admin_id UUID REFERENCES users(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_job_technician_admin_messages_admin_id
        ON job_technician_admin_messages(admin_id);
    END IF;
END $$;
