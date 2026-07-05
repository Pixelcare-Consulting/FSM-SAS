-- Create job_technician_admin_messages table if it doesn't exist
-- This table stores messages between technicians and admins for specific jobs

CREATE TABLE IF NOT EXISTS job_technician_admin_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    technician_job_id UUID REFERENCES technician_jobs(id) ON DELETE SET NULL,
    sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('ADMIN', 'TECHNICIAN')),
    message TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    -- Constraint: Either message or image_url must be provided
    CONSTRAINT check_message_or_image CHECK (
        (message IS NOT NULL AND message != '') OR 
        (image_url IS NOT NULL AND image_url != '')
    )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_technician_admin_messages_job_id ON job_technician_admin_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_job_technician_admin_messages_technician_job_id ON job_technician_admin_messages(technician_job_id);
CREATE INDEX IF NOT EXISTS idx_job_technician_admin_messages_created_at ON job_technician_admin_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_job_technician_admin_messages_deleted_at ON job_technician_admin_messages(deleted_at) WHERE deleted_at IS NULL;

-- Add columns if table exists but columns don't
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_technician_admin_messages') THEN
        -- Add message column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'job_technician_admin_messages' AND column_name = 'message') THEN
            ALTER TABLE job_technician_admin_messages ADD COLUMN message TEXT;
        END IF;
        
        -- Add image_url column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'job_technician_admin_messages' AND column_name = 'image_url') THEN
            ALTER TABLE job_technician_admin_messages ADD COLUMN image_url TEXT;
        END IF;
        
        -- Add created_at column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'job_technician_admin_messages' AND column_name = 'created_at') THEN
            ALTER TABLE job_technician_admin_messages ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        END IF;
        
        -- Add updated_at column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'job_technician_admin_messages' AND column_name = 'updated_at') THEN
            ALTER TABLE job_technician_admin_messages ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        END IF;
        
        -- Drop existing constraint if it exists and recreate it properly
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_message_or_image') THEN
            ALTER TABLE job_technician_admin_messages DROP CONSTRAINT check_message_or_image;
        END IF;
        
        -- Add the constraint properly
        ALTER TABLE job_technician_admin_messages 
        ADD CONSTRAINT check_message_or_image CHECK (
            (message IS NOT NULL AND message != '') OR 
            (image_url IS NOT NULL AND image_url != '')
        );
    END IF;
END $$;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_technician_admin_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_job_technician_admin_messages_updated_at ON job_technician_admin_messages;
CREATE TRIGGER trigger_update_job_technician_admin_messages_updated_at
    BEFORE UPDATE ON job_technician_admin_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_job_technician_admin_messages_updated_at();

