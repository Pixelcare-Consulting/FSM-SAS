-- Next unused portal CP code(s): numeric MAX of /^CP[0-9]+$/ plus skip occupied
-- (UNIQUE includes soft-deleted rows). Apply in Supabase SQL Editor if not yet deployed.

CREATE OR REPLACE FUNCTION public.next_portal_customer_codes(p_count integer DEFAULT 1)
RETURNS TABLE (customer_code TEXT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  max_num BIGINT;
  candidate_num BIGINT;
  candidate TEXT;
  found_count INTEGER := 0;
  skip_left INTEGER;
  start_code TEXT;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN;
  END IF;

  p_count := LEAST(p_count, 500);

  SELECT COALESCE(
    MAX(CAST(substring(c.customer_code FROM 3) AS bigint)),
    0
  )
  INTO max_num
  FROM public.customer c
  WHERE c.customer_code ~ '^CP[0-9]{1,18}$';

  candidate_num := max_num + 1;
  start_code := 'CP' || CASE
    WHEN length(candidate_num::text) >= 5 THEN candidate_num::text
    ELSE lpad(candidate_num::text, 5, '0')
  END;
  skip_left := GREATEST(10000, p_count * 50);

  WHILE found_count < p_count AND skip_left > 0 LOOP
    candidate := 'CP' || CASE
      WHEN length(candidate_num::text) >= 5 THEN candidate_num::text
      ELSE lpad(candidate_num::text, 5, '0')
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.customer occ
      WHERE occ.customer_code = candidate
    ) THEN
      customer_code := candidate;
      RETURN NEXT;
      found_count := found_count + 1;
    END IF;

    candidate_num := candidate_num + 1;
    skip_left := skip_left - 1;
  END LOOP;

  IF found_count < p_count THEN
    RAISE EXCEPTION 'Could not find an available portal customer code (start %, last %)',
      start_code,
      candidate;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_portal_customer_codes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_portal_customer_codes(integer) TO service_role;
