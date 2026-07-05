-- Extended one-time backfill: link customer_address_details.customer_location_id for ship |S,
-- ` - 1` site_id pairs, and merge duplicate note rows (keep row with notes).
-- Run in Supabase SQL Editor after deploy of siteAddressKeyAliases / address-details API fixes.
--
-- Preview (run before apply):
--   SELECT count(*) FROM customer_address_details WHERE deleted_at IS NULL AND customer_location_id IS NULL;

-- 1) Exact site_id = address_name (same as original backfill)
UPDATE public.customer_address_details cad
SET customer_location_id = s.cl_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (cad2.id)
    cad2.id AS cad_row_id,
    cl.id   AS cl_id
  FROM public.customer_address_details cad2
  INNER JOIN public.customer c ON c.customer_code = cad2.customer_code
  INNER JOIN public.customer_location cl
    ON cl.customer_id = c.id
    AND btrim(cl.site_id) = btrim(cad2.address_name)
  WHERE cad2.deleted_at IS NULL
    AND cad2.customer_location_id IS NULL
  ORDER BY cad2.id, cl.id
) s
WHERE cad.id = s.cad_row_id
  AND cad.customer_location_id IS NULL;

-- 2) Ship notes stored as site_id||'|S' → match ship customer_location at same base site_id
UPDATE public.customer_address_details cad
SET customer_location_id = s.cl_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (cad2.id)
    cad2.id AS cad_row_id,
    cl.id   AS cl_id
  FROM public.customer_address_details cad2
  INNER JOIN public.customer c ON c.customer_code = cad2.customer_code
  INNER JOIN public.customer_location cl
    ON cl.customer_id = c.id
    AND btrim(cl.site_id) = btrim(regexp_replace(cad2.address_name, '\|S$', ''))
    AND upper(coalesce(cl.address_type, '')) IN ('S', 'BO_SHIPTO', 'SHIPTO')
  WHERE cad2.deleted_at IS NULL
    AND cad2.customer_location_id IS NULL
    AND cad2.address_name ~ '\|S$'
  ORDER BY cad2.id, cl.id
) s
WHERE cad.id = s.cad_row_id
  AND cad.customer_location_id IS NULL;

-- 3) Ship at `{billSite} - 1` with notes keyed as base||'|S'
UPDATE public.customer_address_details cad
SET customer_location_id = s.cl_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (cad2.id)
    cad2.id AS cad_row_id,
    cl.id   AS cl_id
  FROM public.customer_address_details cad2
  INNER JOIN public.customer c ON c.customer_code = cad2.customer_code
  INNER JOIN public.customer_location cl
    ON cl.customer_id = c.id
    AND btrim(cl.site_id) = btrim(regexp_replace(cad2.address_name, '\|S$', '')) || ' - 1'
    AND upper(coalesce(cl.address_type, '')) IN ('S', 'BO_SHIPTO', 'SHIPTO')
  WHERE cad2.deleted_at IS NULL
    AND cad2.customer_location_id IS NULL
    AND cad2.address_name ~ '\|S$'
  ORDER BY cad2.id, cl.id
) s
WHERE cad.id = s.cad_row_id
  AND cad.customer_location_id IS NULL;

-- 4) address_name matches site_id after stripping trailing |S (ship row keyed on bare site)
UPDATE public.customer_address_details cad
SET customer_location_id = s.cl_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (cad2.id)
    cad2.id AS cad_row_id,
    cl.id   AS cl_id
  FROM public.customer_address_details cad2
  INNER JOIN public.customer c ON c.customer_code = cad2.customer_code
  INNER JOIN public.customer_location cl
    ON cl.customer_id = c.id
    AND (
      btrim(cl.site_id) = btrim(regexp_replace(cad2.address_name, '\|S$', ''))
      OR btrim(cl.site_id) || '|S' = btrim(cad2.address_name)
    )
  WHERE cad2.deleted_at IS NULL
    AND cad2.customer_location_id IS NULL
  ORDER BY cad2.id, cl.id
) s
WHERE cad.id = s.cad_row_id
  AND cad.customer_location_id IS NULL;

-- 5) Merge duplicate customer_address_details for same customer + customer_location_id:
--    keep the row with the longest address_notes; soft-delete empty duplicates.
WITH ranked AS (
  SELECT
    cad.id,
    cad.customer_code,
    cad.customer_location_id,
    cad.address_notes,
    ROW_NUMBER() OVER (
      PARTITION BY cad.customer_code, cad.customer_location_id
      ORDER BY
        CASE WHEN btrim(coalesce(cad.address_notes, '')) = '' THEN 0 ELSE 1 END DESC,
        length(btrim(coalesce(cad.address_notes, ''))) DESC,
        cad.updated_at DESC NULLS LAST,
        cad.id
    ) AS rn
  FROM public.customer_address_details cad
  WHERE cad.deleted_at IS NULL
    AND cad.customer_location_id IS NOT NULL
)
UPDATE public.customer_address_details cad
SET deleted_at = NOW(),
    updated_at = NOW()
FROM ranked r
WHERE cad.id = r.id
  AND r.rn > 1
  AND btrim(coalesce(cad.address_notes, '')) = '';

-- Optional post-check:
-- SELECT customer_code, count(*) FILTER (WHERE customer_location_id IS NULL) AS unlinked
-- FROM customer_address_details WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;
