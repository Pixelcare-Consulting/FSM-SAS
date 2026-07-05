-- Dashboard overview + customer country stats RPCs (egress reduction)

CREATE OR REPLACE FUNCTION public.dashboard_job_status_counts()
RETURNS TABLE (status TEXT, job_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(status::TEXT, 'UNKNOWN') AS status, COUNT(*)::BIGINT AS job_count
  FROM jobs
  WHERE deleted_at IS NULL
  GROUP BY status;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_followup_status_counts()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total', COUNT(*)::BIGINT,
    'logged', COUNT(*) FILTER (
      WHERE UPPER(REPLACE(COALESCE(status, ''), ' ', '_')) = 'LOGGED'
    )::BIGINT,
    'inProgress', COUNT(*) FILTER (
      WHERE UPPER(REPLACE(COALESCE(status, ''), ' ', '_')) = 'IN_PROGRESS'
    )::BIGINT,
    'closed', COUNT(*) FILTER (
      WHERE UPPER(REPLACE(COALESCE(status, ''), ' ', '_')) = 'CLOSED'
    )::BIGINT,
    'cancelled', COUNT(*) FILTER (
      WHERE UPPER(REPLACE(COALESCE(status, ''), ' ', '_')) = 'CANCELLED'
    )::BIGINT
  )
  FROM followups
  WHERE deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_job_count_in_range(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::BIGINT
  FROM jobs
  WHERE deleted_at IS NULL
    AND created_at >= p_start
    AND created_at < p_end;
$$;

CREATE OR REPLACE FUNCTION public.customer_location_country_stats()
RETURNS TABLE (address_count BIGINT, top_country TEXT, top_country_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT TRIM(country_name) AS country, COUNT(*)::BIGINT AS cnt
    FROM customer_location
    WHERE country_name IS NOT NULL
      AND TRIM(country_name) <> ''
    GROUP BY TRIM(country_name)
  ),
  agg AS (
    SELECT COALESCE(SUM(cnt), 0)::BIGINT AS total FROM counts
  ),
  top AS (
    SELECT country, cnt
    FROM counts
    ORDER BY cnt DESC, country ASC
    LIMIT 1
  )
  SELECT agg.total, COALESCE(top.country, ''), COALESCE(top.cnt, 0)::BIGINT
  FROM agg
  LEFT JOIN top ON true;
$$;
