-- =============================================
-- MIGRATION: Add current_session_id to users table
-- =============================================
-- Enables single-device-per-user: when a user logs in on a new device,
-- the previous device's session is invalidated because sessionId won't match.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS current_session_id TEXT;

COMMENT ON COLUMN users.current_session_id IS 'Active session ID for single-device-per-user; cookie must match or request is rejected.';
