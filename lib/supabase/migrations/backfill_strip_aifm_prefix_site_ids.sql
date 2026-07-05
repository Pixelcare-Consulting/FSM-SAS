-- Optional one-time fix if you already imported with `AIFM-` in site_id / address_name.
-- Strips the literal prefix "AIFM-" (5 characters) from the start of the value.
-- Prefer re-running import after truncate, or adjust values manually to match live SAP AddressName.

UPDATE public.customer_location
SET site_id = substring(site_id from 6)
WHERE site_id LIKE 'AIFM-%';

UPDATE public.customer_address_details
SET address_name = substring(address_name from 6)
WHERE address_name LIKE 'AIFM-%';
