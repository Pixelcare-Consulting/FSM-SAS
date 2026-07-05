-- Migration: Track portal session state on users (already present in some environments)
-- is_logged_in: true while user has an active portal session
-- updated_at: bumped on login/logout and profile updates — used as last portal activity timestamp

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.is_logged_in IS 'True while the user has an active portal session (set on login, cleared on logout).';

CREATE INDEX IF NOT EXISTS idx_users_is_logged_in ON users(is_logged_in) WHERE deleted_at IS NULL AND is_logged_in = true;
