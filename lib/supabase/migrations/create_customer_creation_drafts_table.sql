-- =============================================
-- Customer Creation Drafts Table
-- Stores payloads for Create Customer (portal) before/after syncing to SAP
-- Schema aligns with SAP BusinessPartners: Series, CardName, CardType,
-- BPAddresses, ContactEmployees, etc.
-- =============================================

CREATE TABLE IF NOT EXISTS customer_creation_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Full payload as sent to SAP (Series, CardName, CardType, Phone1, BPAddresses, ContactEmployees, etc.)
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- draft | submitted | synced | failed
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'synced', 'failed')),
    -- Set after successful SAP create
    sap_card_code VARCHAR(20),
    -- Set when status = 'failed'
    error_message TEXT,
    -- Audit
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for listing and filtering
CREATE INDEX IF NOT EXISTS idx_customer_creation_drafts_status ON customer_creation_drafts(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_creation_drafts_sap_card_code ON customer_creation_drafts(sap_card_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_creation_drafts_created_at ON customer_creation_drafts(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_creation_drafts_created_by ON customer_creation_drafts(created_by) WHERE deleted_at IS NULL;

-- Trigger for updated_at
CREATE TRIGGER update_customer_creation_drafts_updated_at
    BEFORE UPDATE ON customer_creation_drafts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE customer_creation_drafts IS 'Drafts and audit log for Create Customer (portal) before/after SAP BusinessPartners sync. Payload matches SAP: Series, CardName, CardType, BPAddresses, ContactEmployees.';
