-- Migration: Remove UNIQUE constraint from equipments.item_code
-- This allows multiple equipment entries with the same item_code but different serial_numbers
-- Date: 2024

-- Step 1: Drop the existing unique constraint on item_code
ALTER TABLE equipments 
DROP CONSTRAINT IF EXISTS equipments_item_code_key;

-- Step 2: Optionally, add a composite unique constraint on (item_code, serial_number, customer_id)
-- This ensures that the same item_code + serial_number combination can't be duplicated for the same customer
-- Uncomment the following if you want to enforce this constraint:
-- ALTER TABLE equipments
-- ADD CONSTRAINT equipments_item_code_serial_customer_unique 
-- UNIQUE (item_code, serial_number, customer_id) 
-- WHERE deleted_at IS NULL;

-- Note: If serial_number can be NULL, you may want to handle that case differently
-- For now, we're just removing the constraint to allow multiple E0000 entries with different serial numbers

