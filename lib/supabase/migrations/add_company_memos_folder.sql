-- Organize company memos into folders (General, Update Logs, etc.)

ALTER TABLE company_memos
  ADD COLUMN IF NOT EXISTS folder VARCHAR(100) NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS idx_company_memos_folder
  ON company_memos(folder)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN company_memos.folder IS 'Memo category/folder for admin list filtering';
