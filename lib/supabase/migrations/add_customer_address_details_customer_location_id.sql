-- Link customer_address_details to customer_location (stable FK; address_name string match is fallback).
ALTER TABLE customer_address_details
ADD COLUMN IF NOT EXISTS customer_location_id UUID REFERENCES public.customer_location(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_address_details_customer_location_id
  ON public.customer_address_details(customer_location_id) WHERE customer_location_id IS NOT NULL;
