-- Company memos: portal announcements (header ticker, sign-in, job/dispatch flags)

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS company_memos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject VARCHAR(500) NOT NULL,
    body TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    expires_at TIMESTAMPTZ,
    is_group_memo BOOLEAN NOT NULL DEFAULT false,
    target_group VARCHAR(255),
    show_on_sign_in BOOLEAN NOT NULL DEFAULT false,
    show_on_job_screen BOOLEAN NOT NULL DEFAULT false,
    show_on_dispatch_screen BOOLEAN NOT NULL DEFAULT false,
    show_in_header BOOLEAN NOT NULL DEFAULT true,
    only_creator_can_edit BOOLEAN NOT NULL DEFAULT false,
    folder VARCHAR(100) NOT NULL DEFAULT 'General',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_company_memos_deleted_at ON company_memos(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_memos_header ON company_memos(show_in_header) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_memos_expires_at ON company_memos(expires_at);
CREATE INDEX IF NOT EXISTS idx_company_memos_created_by ON company_memos(created_by);
CREATE INDEX IF NOT EXISTS idx_company_memos_folder ON company_memos(folder) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_company_memos_updated_at ON company_memos;
CREATE TRIGGER update_company_memos_updated_at
    BEFORE UPDATE ON company_memos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE company_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_memos_select_authenticated" ON company_memos;
DROP POLICY IF EXISTS "company_memos_select_anon_authenticated" ON company_memos;

-- Browser client may use anon key without Supabase Auth JWT; allow read like sap_lead policies
CREATE POLICY "company_memos_select_anon_authenticated" ON company_memos
    FOR SELECT
    TO anon, authenticated
    USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "company_memos_insert_admin" ON company_memos;
-- Only admins can create memos (requires Supabase Auth JWT; set session on login if this fails from the browser)
CREATE POLICY "company_memos_insert_admin" ON company_memos
    FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role = 'ADMIN'
              AND u.deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS "company_memos_update_authenticated" ON company_memos;
-- Update: admin; or creator; or any authenticated user when memo is not "only creator edits"
CREATE POLICY "company_memos_update_authenticated" ON company_memos
    FOR UPDATE
    TO authenticated
    USING (
        deleted_at IS NULL
        AND (
            EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid()
                  AND u.role = 'ADMIN'
                  AND u.deleted_at IS NULL
            )
            OR created_by = auth.uid()
            OR (
                NOT only_creator_can_edit
                AND EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.deleted_at IS NULL
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role = 'ADMIN'
              AND u.deleted_at IS NULL
        )
        OR created_by = auth.uid()
        OR (
            NOT only_creator_can_edit
            AND EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid()
                  AND u.deleted_at IS NULL
            )
        )
    );

COMMENT ON TABLE company_memos IS 'Company-wide portal memos (header ticker, sign-in modal, job/dispatch surfaces)';
