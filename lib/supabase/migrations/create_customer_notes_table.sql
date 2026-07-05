-- Migration: Create customer_notes table
-- Date: 2025-01-XX
-- Description: Creates customer_notes table to store notes for customers

CREATE TABLE IF NOT EXISTS customer_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    user_email VARCHAR(255),
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_created_at ON customer_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notes_deleted_at ON customer_notes(deleted_at) WHERE deleted_at IS NULL;

-- Add trigger for updated_at
CREATE TRIGGER update_customer_notes_updated_at BEFORE UPDATE ON customer_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies (if needed)
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all notes
CREATE POLICY "Users can view customer notes" ON customer_notes
    FOR SELECT USING (true);

-- Policy: Users can insert notes
CREATE POLICY "Users can insert customer notes" ON customer_notes
    FOR INSERT WITH CHECK (true);

-- Policy: Users can update notes
CREATE POLICY "Users can update customer notes" ON customer_notes
    FOR UPDATE USING (true);

-- Policy: Users can delete notes
CREATE POLICY "Users can delete customer notes" ON customer_notes
    FOR DELETE USING (true);

