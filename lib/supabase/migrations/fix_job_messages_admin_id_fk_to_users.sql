-- Fix admin_id FK on job_technician_admin_messages.
-- Production incorrectly referenced technicians(user_id), so portal admins who are
-- not also technicians could not send Job Messages (FK violation on insert).
-- Align with intended schema: admin_id → public.users(id).

DO $$
DECLARE
  constraint_name_var TEXT;
BEGIN
  SELECT conname INTO constraint_name_var
  FROM pg_constraint
  WHERE conrelid = 'job_technician_admin_messages'::regclass
    AND contype = 'f'
    AND conname ILIKE '%admin_id%'
  LIMIT 1;

  IF constraint_name_var IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE job_technician_admin_messages DROP CONSTRAINT IF EXISTS %I',
      constraint_name_var
    );
    RAISE NOTICE 'Dropped constraint: %', constraint_name_var;
  END IF;
END $$;

ALTER TABLE job_technician_admin_messages
  ADD CONSTRAINT job_technician_admin_messages_admin_id_fkey
  FOREIGN KEY (admin_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT job_technician_admin_messages_admin_id_fkey
ON job_technician_admin_messages IS
'admin_id is the portal user (users.id) who sent an ADMIN message.';
