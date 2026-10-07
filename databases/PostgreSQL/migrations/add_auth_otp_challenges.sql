-- ============================================================
-- ADD OTP CHALLENGES AND THE PER-USER TWO-STEP SWITCH  (auth_db)
-- PostgreSQL
-- ============================================================
-- Run once against an EXISTING auth_db. Nothing is dropped and no data is lost; running it again is harmless. It brings
-- any of these starting points up to date: no otp_challenges table, the first version of it, or the current one.
--
--   psql -U postgres -h localhost -d auth_db -f add_auth_otp_challenges.sql
--
-- The auth service runs the same statements itself every time it starts (OtpSchemaService), so this file is for people who
-- prefer to run it by hand, or whose database user may not create tables.
--
-- What it sets up
--   * otp_challenges: one row per challenge. A sign-in waiting for its emailed code, a password reset, or a REGISTRATION whose
--     email is being verified (it has no user yet, so user_id may be null and what was typed waits in the pending_* columns,
--     the password already hashed). Codes are never stored, only an HMAC of them.
--   * users.two_factor_enabled: each user's own choice to be asked for an emailed code at sign-in. Off until they switch it on.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS otp_challenges (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    purpose                VARCHAR(14) NOT NULL,
    code_hash              VARCHAR(64) NOT NULL,
    attempts               INTEGER NOT NULL DEFAULT 0,
    sends                  INTEGER NOT NULL DEFAULT 1,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at             TIMESTAMPTZ NOT NULL,
    consumed_at            TIMESTAMPTZ,
    pending_username       VARCHAR(64),
    pending_email          VARCHAR(255),
    pending_password_hash  VARCHAR(255),
    reset_token_hash       VARCHAR(64) UNIQUE,
    reset_expires_at       TIMESTAMPTZ,
    reset_used_at          TIMESTAMPTZ,

    CONSTRAINT chk_otp_challenges_attempts CHECK (attempts >= 0),
    CONSTRAINT chk_otp_challenges_sends CHECK (sends >= 1)
);

-- From the first version of the table: the user becomes optional, the typed details get their columns, and REGISTRATION is allowed.
ALTER TABLE otp_challenges ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS pending_username VARCHAR(64);
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS pending_password_hash VARCHAR(255);
ALTER TABLE otp_challenges DROP CONSTRAINT IF EXISTS chk_otp_challenges_purpose;
ALTER TABLE otp_challenges ADD CONSTRAINT chk_otp_challenges_purpose
    CHECK (purpose IN ('LOGIN', 'PASSWORD_RESET', 'REGISTRATION'));

CREATE INDEX IF NOT EXISTS idx_otp_challenges_user_id ON otp_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires_at ON otp_challenges(expires_at);

-- Two-step sign-in is each user's own choice, off until they switch it on in Settings.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- The auth service connects as auth_user in the setup script's layout; keep it able to use the new table.
DO
$grants$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_user') THEN
    GRANT ALL PRIVILEGES ON TABLE otp_challenges TO auth_user;
  END IF;
END
$grants$;

COMMIT;
