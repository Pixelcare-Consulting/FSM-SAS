-- Master lookup tables for Create/Edit Jobs dropdowns (Contact Type + Subject).
-- These decouple the dropdowns from a live SAP session: APIs read these tables first and
-- only fall back to SAP when empty. Seeded by scripts/seed-job-lookups.mjs.
--
-- Distinct from the per-job tables job_contact_type / job_category (those store the
-- selection chosen for a single job; these store the master option lists).
--
-- Idempotent: safe to paste/run multiple times in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.job_contact_type_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code INTEGER,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    sap_synced_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.job_subject_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sap_job_cat_id TEXT,
    name TEXT,
    code TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    sap_synced_at TIMESTAMP WITH TIME ZONE
);

-- Unique constraints back the upsert onConflict keys (code / sap_job_cat_id).
-- Guarded so this stays idempotent even if the tables already existed without them.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'job_contact_type_options_code_unique'
    ) THEN
        ALTER TABLE public.job_contact_type_options
            ADD CONSTRAINT job_contact_type_options_code_unique UNIQUE (code);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'job_subject_options_sap_job_cat_id_unique'
    ) THEN
        ALTER TABLE public.job_subject_options
            ADD CONSTRAINT job_subject_options_sap_job_cat_id_unique UNIQUE (sap_job_cat_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_contact_type_options_active
    ON public.job_contact_type_options(is_active, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_job_subject_options_active
    ON public.job_subject_options(is_active, sort_order, name);

COMMENT ON TABLE public.job_contact_type_options IS 'Master list for Create/Edit Jobs Contact Type dropdown (SAP OCLT codes). Read-first source so jobs can be created when SAP is down.';
COMMENT ON TABLE public.job_subject_options IS 'Master list for Create/Edit Jobs Subject dropdown (SAP U_API_JOB_CATEGORY / U_JobCatID). Read-first source so jobs can be created when SAP is down.';
