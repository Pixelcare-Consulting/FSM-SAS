-- Optional link: which service site (customer_location) this contact belongs to.
-- Allows multiple contacts per customer across different locations.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS customer_location_id UUID REFERENCES public.customer_location(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_customer_location_id
  ON public.contacts(customer_location_id) WHERE customer_location_id IS NOT NULL;

COMMENT ON COLUMN public.contacts.customer_location_id IS
  'When set, contact is associated with a specific customer_location site; NULL = customer-level only.';
