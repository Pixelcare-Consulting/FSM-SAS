-- Per-user read receipts for Job Messages (multi-admin safe).
-- Apply in Supabase SQL editor (or your migration runner).
--
-- Unread for user U =
--   message not soft-deleted
--   AND no row in job_message_reads for (message_id, U)
--   AND message is not an ADMIN send by U (own messages never count as unread)

CREATE TABLE IF NOT EXISTS job_message_reads (
  message_id UUID NOT NULL REFERENCES job_technician_admin_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_job_message_reads_user_id
  ON job_message_reads (user_id);

CREATE INDEX IF NOT EXISTS idx_job_message_reads_user_read_at
  ON job_message_reads (user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_message_reads_message_id
  ON job_message_reads (message_id);

COMMENT ON TABLE job_message_reads IS
  'Per-user Job Message read receipts. Absence of a row means unread for that user (except own ADMIN sends).';

-- Total unread count for a portal user (optional sender_type / job_id filters)
CREATE OR REPLACE FUNCTION count_unread_job_messages(
  p_user_id uuid,
  p_sender_type text DEFAULT NULL,
  p_job_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM job_technician_admin_messages m
  WHERE m.deleted_at IS NULL
    AND (p_job_id IS NULL OR m.job_id = p_job_id)
    AND (
      p_sender_type IS NULL
      OR btrim(p_sender_type) = ''
      OR m.sender_type = upper(btrim(p_sender_type))
    )
    AND NOT (
      m.sender_type = 'ADMIN'
      AND m.admin_id IS NOT NULL
      AND m.admin_id = p_user_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM job_message_reads r
      WHERE r.message_id = m.id
        AND r.user_id = p_user_id
    );
$$;

-- Paginated unread message ids (newest first)
CREATE OR REPLACE FUNCTION list_unread_job_message_ids(
  p_user_id uuid,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0,
  p_sender_type text DEFAULT NULL,
  p_job_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id
  FROM job_technician_admin_messages m
  WHERE m.deleted_at IS NULL
    AND (p_job_id IS NULL OR m.job_id = p_job_id)
    AND (
      p_sender_type IS NULL
      OR btrim(p_sender_type) = ''
      OR m.sender_type = upper(btrim(p_sender_type))
    )
    AND NOT (
      m.sender_type = 'ADMIN'
      AND m.admin_id IS NOT NULL
      AND m.admin_id = p_user_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM job_message_reads r
      WHERE r.message_id = m.id
        AND r.user_id = p_user_id
    )
  ORDER BY m.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION count_unread_job_messages(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION list_unread_job_message_ids(uuid, int, int, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION count_unread_job_messages(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_unread_job_message_ids(uuid, int, int, text, uuid) TO authenticated;
