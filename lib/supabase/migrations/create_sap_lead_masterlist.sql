-- SAP BusinessPartner leads (CardType L / masterlist tag "SAP Lead") — parallel to customer masterlist.
-- Populated from Excel (Mapped AIFM to SAP) via scripts/import-aifm-masterlist-sap-leads.js

CREATE TABLE IF NOT EXISTS public.sap_lead (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_code VARCHAR(100) NOT NULL,
  lead_name VARCHAR(255) NOT NULL,
  lead_address TEXT,
  phone_number VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT sap_lead_lead_code_unique UNIQUE (lead_code)
);

CREATE TABLE IF NOT EXISTS public.sap_lead_location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sap_lead_id UUID NOT NULL REFERENCES public.sap_lead(id) ON DELETE CASCADE,
  site_id VARCHAR(100),
  building VARCHAR(255),
  street_number VARCHAR(50),
  street VARCHAR(255),
  block VARCHAR(100),
  address TEXT,
  city VARCHAR(255),
  country_name VARCHAR(255),
  zip_code VARCHAR(20),
  address_type VARCHAR(50),
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.sap_lead_contact (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sap_lead_id UUID NOT NULL REFERENCES public.sap_lead(id) ON DELETE CASCADE,
  sap_lead_location_id UUID REFERENCES public.sap_lead_location(id) ON DELETE SET NULL,
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  tel1 VARCHAR(50),
  tel2 VARCHAR(50),
  email VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_sap_lead_lead_code ON public.sap_lead(lead_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sap_lead_email ON public.sap_lead(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sap_lead_location_sap_lead_id ON public.sap_lead_location(sap_lead_id);
CREATE INDEX IF NOT EXISTS idx_sap_lead_location_site_id ON public.sap_lead_location(site_id);
CREATE INDEX IF NOT EXISTS idx_sap_lead_contact_sap_lead_id ON public.sap_lead_contact(sap_lead_id);
CREATE INDEX IF NOT EXISTS idx_sap_lead_contact_location_id ON public.sap_lead_contact(sap_lead_location_id)
  WHERE sap_lead_location_id IS NOT NULL;

COMMENT ON TABLE public.sap_lead IS 'SAP B1 leads (L*) from migrated Excel masterlist; not the portal google_forms leads table.';

CREATE TRIGGER update_sap_lead_updated_at
  BEFORE UPDATE ON public.sap_lead
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
