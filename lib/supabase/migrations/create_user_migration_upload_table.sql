-- Create user migration staging table for Excel imports
-- Stores parsed Excel rows (JSONB) from FSM User ID & Password.xlsx before applying to auth.users, users, technicians.

CREATE TABLE IF NOT EXISTS user_migration_upload (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(512) NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'PARTIAL', 'FAILED')),
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_migration_upload_status ON user_migration_upload(status);
CREATE INDEX IF NOT EXISTS idx_user_migration_upload_uploaded_at ON user_migration_upload(uploaded_at);

-- Keep updated_at in sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_user_migration_upload_updated_at'
  ) THEN
    CREATE TRIGGER update_user_migration_upload_updated_at
      BEFORE UPDATE ON user_migration_upload
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
