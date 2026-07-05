-- Report aggregate RPCs (egress reduction — replaces .limit(8000) in-memory GROUP BY)

CREATE OR REPLACE FUNCTION public.report_job_category_aggregates()
RETURNS TABLE (description TEXT, job_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(jc.description), ''), 'Uncategorized') AS description,
    COUNT(*)::BIGINT AS job_count
  FROM job_category jc
  INNER JOIN jobs j ON j.id = jc.job_id AND j.deleted_at IS NULL
  GROUP BY COALESCE(NULLIF(TRIM(jc.description), ''), 'Uncategorized')
  ORDER BY job_count DESC, description ASC;
$$;

CREATE OR REPLACE FUNCTION public.report_equipment_brand_aggregates()
RETURNS TABLE (brand TEXT, equipment_count BIGINT, types TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      COALESCE(NULLIF(TRIM(brand), ''), 'Unknown') AS brand,
      equipment_type
    FROM equipments
    WHERE deleted_at IS NULL
  ),
  grouped AS (
    SELECT brand, COUNT(*)::BIGINT AS equipment_count
    FROM base
    GROUP BY brand
  ),
  type_lists AS (
    SELECT
      b.brand,
      (
        SELECT string_agg(type_name, ', ')
        FROM (
          SELECT equipment_type AS type_name
          FROM base b2
          WHERE b2.brand = b.brand
            AND equipment_type IS NOT NULL
            AND TRIM(equipment_type) <> ''
          GROUP BY equipment_type
          ORDER BY type_name
          LIMIT 5
        ) sub
      ) AS types
    FROM (SELECT DISTINCT brand FROM base) b
  )
  SELECT
    g.brand,
    g.equipment_count,
    COALESCE(t.types, '—') AS types
  FROM grouped g
  LEFT JOIN type_lists t ON t.brand = g.brand
  ORDER BY g.equipment_count DESC, g.brand ASC;
$$;

CREATE OR REPLACE FUNCTION public.report_product_category_aggregates()
RETURNS TABLE (name TEXT, total_items BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(item_group), ''), 'Unspecified') AS name,
    COUNT(*)::BIGINT AS total_items
  FROM equipments
  WHERE deleted_at IS NULL
  GROUP BY COALESCE(NULLIF(TRIM(item_group), ''), 'Unspecified')
  ORDER BY total_items DESC, name ASC;
$$;
