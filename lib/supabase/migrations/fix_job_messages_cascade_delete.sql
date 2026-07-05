-- Fix job_technician_admin_messages foreign key constraint
-- Change from ON DELETE CASCADE to ON DELETE RESTRICT to prevent messages
-- from being deleted when jobs are updated or deleted
-- 
-- This migration addresses the bug where updating job status causes
-- related messages to be deleted unexpectedly.

-- Drop the existing foreign key constraint
-- Use pg_constraint to find and drop the constraint
DO $$ 
DECLARE
    constraint_name_var TEXT;
BEGIN
    -- Find the foreign key constraint on job_id
    SELECT conname INTO constraint_name_var
    FROM pg_constraint
    WHERE conrelid = 'job_technician_admin_messages'::regclass
    AND contype = 'f'
    AND confrelid = 'jobs'::regclass
    LIMIT 1;
    
    IF constraint_name_var IS NOT NULL THEN
        EXECUTE format('ALTER TABLE job_technician_admin_messages DROP CONSTRAINT IF EXISTS %I', constraint_name_var);
        RAISE NOTICE 'Dropped constraint: %', constraint_name_var;
    ELSE
        RAISE NOTICE 'No foreign key constraint found on job_id';
    END IF;
END $$;

-- Recreate the foreign key constraint with ON DELETE RESTRICT
-- This prevents deletion of messages when a job is deleted, and ensures
-- that jobs cannot be deleted if they have messages (data integrity)
ALTER TABLE job_technician_admin_messages
ADD CONSTRAINT job_technician_admin_messages_job_id_fkey
FOREIGN KEY (job_id) 
REFERENCES jobs(id) 
ON DELETE RESTRICT;

-- Add a comment to document the change
COMMENT ON CONSTRAINT job_technician_admin_messages_job_id_fkey 
ON job_technician_admin_messages IS 
'Foreign key to jobs table. Uses ON DELETE RESTRICT to prevent accidental deletion of messages when jobs are updated or deleted.';

