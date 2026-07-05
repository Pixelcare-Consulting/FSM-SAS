-- pg_trgm indexes for masterlist search (customer + sap_lead).
-- Apply via Supabase SQL editor or migration pipeline.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_customer_code_trgm
  ON public.customer USING gin (customer_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_name_trgm
  ON public.customer USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_phone_trgm
  ON public.customer USING gin (phone_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_email_trgm
  ON public.customer USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_sap_lead_code_trgm
  ON public.sap_lead USING gin (lead_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_sap_lead_name_trgm
  ON public.sap_lead USING gin (lead_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_sap_lead_phone_trgm
  ON public.sap_lead USING gin (phone_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_sap_lead_email_trgm
  ON public.sap_lead USING gin (email gin_trgm_ops);

-- Optional RPC (wire global-masterlist when PostgREST ilike is insufficient):
-- CREATE OR REPLACE FUNCTION public.search_masterlist(q text, result_limit int DEFAULT 50)
-- RETURNS TABLE (
--   source text,
--   code text,
--   name text,
--   phone text,
--   email text,
--   address text
-- ) LANGUAGE sql STABLE AS $$
--   SELECT 'customer', customer_code, customer_name, phone_number, email, customer_address
--   FROM customer
--   WHERE deleted_at IS NULL
--     AND (
--       customer_code ILIKE '%' || q || '%'
--       OR customer_name ILIKE '%' || q || '%'
--       OR phone_number ILIKE '%' || q || '%'
--       OR email ILIKE '%' || q || '%'
--     )
--   UNION ALL
--   SELECT 'sap_lead', lead_code, lead_name, phone_number, email, lead_address
--   FROM sap_lead
--   WHERE deleted_at IS NULL
--     AND (
--       lead_code ILIKE '%' || q || '%'
--       OR lead_name ILIKE '%' || q || '%'
--       OR phone_number ILIKE '%' || q || '%'
--       OR email ILIKE '%' || q || '%'
--     )
--   LIMIT result_limit;
-- $$;
