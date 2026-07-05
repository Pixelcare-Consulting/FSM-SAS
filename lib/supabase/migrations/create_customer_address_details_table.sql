-- Migration: Create customer_address_details table
-- Date: 2025-01-XX
-- Description: Creates customer_address_details table to store editable address details (Status and Address Notes)
-- This table stores additional editable fields for customer addresses that can be modified in the FSM portal

CREATE TABLE IF NOT EXISTS customer_address_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code VARCHAR(100) NOT NULL,
    address_name VARCHAR(255) NOT NULL,
    address_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Active',
    address_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    -- Unique constraint to ensure one record per customer address
    UNIQUE(customer_code, address_name)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customer_address_details_customer_code ON customer_address_details(customer_code);
CREATE INDEX IF NOT EXISTS idx_customer_address_details_address_name ON customer_address_details(address_name);
CREATE INDEX IF NOT EXISTS idx_customer_address_details_status ON customer_address_details(status);
CREATE INDEX IF NOT EXISTS idx_customer_address_details_deleted_at ON customer_address_details(deleted_at) WHERE deleted_at IS NULL;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customer_address_details_updated_at 
    BEFORE UPDATE ON customer_address_details
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE customer_address_details ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all address details
CREATE POLICY "Users can view customer address details" ON customer_address_details
    FOR SELECT USING (true);

-- Policy: Users can insert address details
CREATE POLICY "Users can insert customer address details" ON customer_address_details
    FOR INSERT WITH CHECK (true);

-- Policy: Users can update address details
CREATE POLICY "Users can update customer address details" ON customer_address_details
    FOR UPDATE USING (true);

-- Policy: Users can delete address details (soft delete)
CREATE POLICY "Users can delete customer address details" ON customer_address_details
    FOR DELETE USING (true);

