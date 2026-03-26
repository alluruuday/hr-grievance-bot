-- Migration 002: Google SSO support

-- Allow null password_hash for SSO-only users
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Add Google OAuth fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id  VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
