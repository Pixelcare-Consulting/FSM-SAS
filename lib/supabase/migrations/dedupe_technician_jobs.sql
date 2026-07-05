-- =============================================
-- Deduplicate technician_jobs (active rows only)
-- =============================================
-- Root cause: UNIQUE(technician_id, job_id, deleted_at) allows many rows when
-- deleted_at IS NULL (PostgreSQL treats each NULL as distinct).
--
-- Run AFTER reviewing counts. Then run backfill_technician_hours.sql again.
--
-- Step 1 — preview duplicate groups (read-only)
-- SELECT job_id, technician_id, COUNT(*) AS cnt
-- FROM technician_jobs
-- WHERE deleted_at IS NULL
-- GROUP BY job_id, technician_id
-- HAVING COUNT(*) > 1
-- ORDER BY cnt DESC;

-- Step 2 — dedupe: keep richest row per (technician_id, job_id), soft-delete rest
DROP TABLE IF EXISTS _tj_dedupe_losers;

CREATE TEMP TABLE _tj_dedupe_losers AS
WITH ranked AS (
  SELECT
    id,
    technician_id,
    job_id,
    ROW_NUMBER() OVER (
      PARTITION BY technician_id, job_id
      ORDER BY
        (CASE WHEN assignment_status = 'COMPLETED' THEN 1 ELSE 0 END) DESC,
        (CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) DESC,
        (CASE WHEN started_at IS NOT NULL THEN 1 ELSE 0 END) DESC,
        COALESCE(accumulated_hours, 0) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM technician_jobs
  WHERE deleted_at IS NULL
),
winners AS (
  SELECT id AS winner_id, technician_id, job_id
  FROM ranked
  WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, w.winner_id
  FROM ranked r
  JOIN winners w ON w.technician_id = r.technician_id AND w.job_id = r.job_id
  WHERE r.rn > 1
)
SELECT loser_id, winner_id FROM losers;

-- Repoint FKs (tables that reference technician_jobs.id)
UPDATE attendance a
SET technician_job_id = d.winner_id
FROM _tj_dedupe_losers d
WHERE a.technician_job_id = d.loser_id;

UPDATE job_media m
SET technician_job_id = d.winner_id
FROM _tj_dedupe_losers d
WHERE m.technician_job_id = d.loser_id;

UPDATE job_signatures s
SET technician_job_id = d.winner_id
FROM _tj_dedupe_losers d
WHERE s.technician_job_id = d.loser_id;

-- job_messages / messages table if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'job_messages'
  ) THEN
    EXECUTE $sql$
      UPDATE job_messages m
      SET technician_job_id = d.winner_id
      FROM _tj_dedupe_losers d
      WHERE m.technician_job_id = d.loser_id
    $sql$;
  END IF;
END $$;

-- task_completions: may conflict on (technician_job_id, job_task_id) — drop loser rows that would duplicate
DELETE FROM task_completions tc
USING _tj_dedupe_losers d
WHERE tc.technician_job_id = d.loser_id
  AND EXISTS (
    SELECT 1 FROM task_completions w
    WHERE w.technician_job_id = d.winner_id
      AND w.job_task_id = tc.job_task_id
  );

UPDATE task_completions tc
SET technician_job_id = d.winner_id
FROM _tj_dedupe_losers d
WHERE tc.technician_job_id = d.loser_id;

-- Remove cached labor for duplicate rows
DELETE FROM technician_hours th
USING _tj_dedupe_losers d
WHERE th.technician_job_id = d.loser_id;

-- Soft-delete duplicate technician_jobs
UPDATE technician_jobs tj
SET deleted_at = NOW(), updated_at = NOW()
FROM _tj_dedupe_losers d
WHERE tj.id = d.loser_id;

DROP TABLE IF EXISTS _tj_dedupe_losers;

-- Step 3 — prevent future duplicates (one active row per tech+job)
DROP INDEX IF EXISTS idx_technician_jobs_unique_active;
CREATE UNIQUE INDEX idx_technician_jobs_unique_active
  ON technician_jobs (technician_id, job_id)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_technician_jobs_unique_active IS
  'One active assignment per technician per job; replaces broken UNIQUE(technician_id, job_id, deleted_at) NULL semantics.';
