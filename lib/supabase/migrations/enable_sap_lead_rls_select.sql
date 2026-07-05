-- Browser reads use anon / authenticated Supabase keys. Without SELECT policies, RLS returns zero rows
-- (Table Editor still shows data via service role).
-- Safe to run multiple times.

ALTER TABLE public.sap_lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_lead_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_lead_contact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sap_lead_select_anon_authenticated" ON public.sap_lead;
DROP POLICY IF EXISTS "sap_lead_location_select_anon_authenticated" ON public.sap_lead_location;
DROP POLICY IF EXISTS "sap_lead_contact_select_anon_authenticated" ON public.sap_lead_contact;

CREATE POLICY "sap_lead_select_anon_authenticated"
  ON public.sap_lead
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "sap_lead_location_select_anon_authenticated"
  ON public.sap_lead_location
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "sap_lead_contact_select_anon_authenticated"
  ON public.sap_lead_contact
  FOR SELECT
  TO anon, authenticated
  USING (true);
