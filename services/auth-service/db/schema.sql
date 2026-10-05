-- ============================================================
-- CREATE SCHEMA - AUTH DATABASE
-- PostgreSQL
-- ============================================================

BEGIN;

-- ============================================================
-- 1. USERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    account_id BIGINT NOT NULL,
    roles TEXT[] NOT NULL DEFAULT '{CUSTOMER}',
    created_on TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_username_length 
        CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 64),
    CONSTRAINT chk_username_pattern
        CHECK (username ~ '^[a-zA-Z0-9._-]+$'),
    CONSTRAINT chk_account_id
        CHECK (account_id > 0),
    CONSTRAINT chk_roles_not_empty
        CHECK (array_length(roles, 1) > 0)
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_account_id ON users(account_id);

-- ============================================================
-- 2. REFRESH TOKENS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    CONSTRAINT chk_token_expiry
        CHECK (expires_at > issued_at),
    CONSTRAINT chk_revoked_logic
        CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(revoked_at) WHERE revoked_at IS NULL;

COMMIT;
