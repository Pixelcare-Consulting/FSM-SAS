-- Link customer_location to locations (same as job migration UI / apply.js).
-- Enables jobs and address-details to resolve the same service site row.

ALTER TABLE public.customer_location
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_location_location_id
  ON public.customer_location(location_id)
  WHERE location_id IS NOT NULL;
