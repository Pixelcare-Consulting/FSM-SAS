-- One-time backfill: set customer_address_details.customer_location_id for rows
-- where it is NULL but a matching customer_location exists (same customer + site_id = address_name).
-- Run in Supabase SQL Editor after add_customer_address_details_customer_location_id.sql (or if column already exists).
--
-- Match rule: customers.customer_code = customer_address_details.customer_code
--             customer_location.site_id = customer_address_details.address_name (trimmed)
-- If multiple customer_location rows match, we pick the smallest cl.id (deterministic).

UPDATE public.customer_address_details cad
SET customer_location_id = s.cl_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (cad2.id)
    cad2.id AS cad_row_id,
    cl.id   AS cl_id
  FROM public.customer_address_details cad2
  INNER JOIN public.customer c
    ON c.customer_code = cad2.customer_code
  INNER JOIN public.customer_location cl
    ON cl.customer_id = c.id
    AND btrim(cl.site_id) = btrim(cad2.address_name)
  WHERE cad2.deleted_at IS NULL
    AND cad2.customer_location_id IS NULL
  ORDER BY cad2.id, cl.id
) s
WHERE cad.id = s.cad_row_id
  AND cad.customer_location_id IS NULL;

-- Optional: preview how many rows would still be NULL (run SELECT before/after in dev)
-- SELECT count(*) FROM customer_address_details
--   WHERE deleted_at IS NULL AND customer_location_id IS NULL;
