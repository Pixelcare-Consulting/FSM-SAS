-- Optional: remove trailing " · 35906" style suffix (legacy disambiguator using API id) from site keys.
-- Run only if you imported with that pattern; verify rows stay unique per customer.

UPDATE public.customer_location
SET site_id = regexp_replace(site_id, ' · \d+$', '')
WHERE site_id ~ ' · \d+$';

UPDATE public.customer_address_details
SET address_name = regexp_replace(address_name, ' · \d+$', '')
WHERE address_name ~ ' · \d+$';
