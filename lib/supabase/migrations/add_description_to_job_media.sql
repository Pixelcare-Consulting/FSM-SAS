-- =============================================
-- MIGRATION: Add description column to job_media
-- =============================================
-- Stores the user-provided caption/description for each uploaded job photo
-- so that the Job View page and the generated Jobsheet PDF both display
-- the same description + timestamp footer.

ALTER TABLE job_media
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN job_media.description IS
  'Optional user-provided description/caption for the uploaded media (shown under photo on Job View page and in Jobsheet PDF).';
