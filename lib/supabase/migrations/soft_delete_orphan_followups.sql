-- Soft-delete follow-ups whose parent job was already soft-deleted.
-- Safe to re-run: only touches rows where followups.deleted_at IS NULL.
UPDATE followups f
SET
  deleted_at = j.deleted_at,
  updated_at = NOW()
FROM jobs j
WHERE f.job_id = j.id
  AND j.deleted_at IS NOT NULL
  AND f.deleted_at IS NULL;
