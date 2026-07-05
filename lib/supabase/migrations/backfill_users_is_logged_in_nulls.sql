-- One-time backfill: legacy rows may have users.is_logged_in = NULL
-- This normalizes them to false so "Unknown" does not persist in admin UIs.

UPDATE users
SET is_logged_in = false
WHERE is_logged_in IS NULL;

-- Optional safety: ensure future writes never store NULL
ALTER TABLE users
ALTER COLUMN is_logged_in SET DEFAULT false;

ALTER TABLE users
ALTER COLUMN is_logged_in SET NOT NULL;

