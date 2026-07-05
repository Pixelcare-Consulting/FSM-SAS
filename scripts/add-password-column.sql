-- Add password column to users table
-- Run this in your Supabase SQL Editor

-- Check if password column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'password'
    ) THEN
        ALTER TABLE users ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT '';
        -- Remove the default after adding (since we want it to be required)
        ALTER TABLE users ALTER COLUMN password DROP DEFAULT;
        
        RAISE NOTICE 'Password column added successfully';
    ELSE
        RAISE NOTICE 'Password column already exists';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

