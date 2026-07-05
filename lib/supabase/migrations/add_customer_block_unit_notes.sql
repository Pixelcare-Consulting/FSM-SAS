-- Add block, unit, notes to customer table for portal customers (Edit Lead modal)
-- Run in Supabase SQL Editor. Allows saving Block, Unit, Notes when editing Portal customers.

ALTER TABLE public.customer ADD COLUMN IF NOT EXISTS block VARCHAR(100);
ALTER TABLE public.customer ADD COLUMN IF NOT EXISTS unit VARCHAR(100);
ALTER TABLE public.customer ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.customer.block IS 'Block (portal customers only, from Edit Lead)';
COMMENT ON COLUMN public.customer.unit IS 'Unit (portal customers only, from Edit Lead)';
COMMENT ON COLUMN public.customer.notes IS 'Notes (portal customers only, from Edit Lead)';
