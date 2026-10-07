-- ============================================================
-- Auth Database Setup Script
-- PostgreSQL 16
-- ============================================================
-- 
-- This script creates the auth_db and all necessary tables for
-- the Sprint 8 Auth Service.
--
-- Connection: psql -U postgres -h localhost
-- Password: n3u3d4!
--
-- Usage: 
--   psql -U postgres -h localhost < auth_setup.sql
-- OR:
--   psql -U postgres -h localhost
--   \i auth_setup.sql

-- ============================================================
-- CREATE DATABASE AND USER
-- ============================================================

-- Create auth_user role if not exists
DO
$do$
BEGIN
  IF NOT EXISTS(SELECT FROM pg_user WHERE usename = 'auth_user') THEN
    CREATE USER auth_user WITH PASSWORD 'auth_password';
  END IF;
END
$do$;

-- Create auth_db database if not exists
SELECT 'CREATE DATABASE auth_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_user;

-- ============================================================
-- CONNECT TO auth_db AND CREATE SCHEMA
-- ============================================================

-- Switch to auth_db (in interactive psql, use: \c auth_db)
-- Note: If running from file, execute remaining commands in auth_db context

\c auth_db

-- Create users table with consolidated auth + client fields
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    account_id BIGINT NOT NULL,
    roles TEXT[] NOT NULL DEFAULT ARRAY['CUSTOMER'],
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    client_name VARCHAR(255),
    phone_no VARCHAR(20),
    dob DATE,
    created_on TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_roles CHECK (array_length(roles, 1) > 0)
);

-- Create indexes on users table
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id);

-- Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT chk_refresh_tokens_expires CHECK (expires_at > issued_at)
);

-- Create indexes on refresh_tokens table
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(revoked_at) 
  WHERE revoked_at IS NULL;

-- Create otp_challenges table: one-time codes for two-step sign-in, forgot password and registration (email check). Only an HMAC
-- of the code is stored. A registration has no user yet, so user_id may be null and what was typed waits in pending_*.
-- (Existing databases: databases/PostgreSQL/migrations/add_auth_otp_challenges.sql.)
CREATE TABLE IF NOT EXISTS otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
  purpose VARCHAR(14) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sends INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  pending_username VARCHAR(64),
  pending_email VARCHAR(255),
  pending_password_hash VARCHAR(255),
  reset_token_hash VARCHAR(64) UNIQUE,
  reset_expires_at TIMESTAMPTZ,
  reset_used_at TIMESTAMPTZ,
  CONSTRAINT chk_otp_challenges_purpose CHECK (purpose IN ('LOGIN', 'PASSWORD_RESET', 'REGISTRATION')),
  CONSTRAINT chk_otp_challenges_attempts CHECK (attempts >= 0),
  CONSTRAINT chk_otp_challenges_sends CHECK (sends >= 1)
);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_user_id ON otp_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires_at ON otp_challenges(expires_at);

-- ============================================================
-- SEED TEST DATA
-- ============================================================

-- Insert 10 test users
-- Note: These passwords are placeholder hashes. In production,
-- register users through the API to get proper Argon2id hashes.

INSERT INTO users (
  username, email, password_hash, account_id, roles, 
  client_name, phone_no, dob, created_on, updated_at
) VALUES
  ('john.smith', 'john.smith@example.com', 
   '$2b$12$clienthash001', 1, ARRAY['CUSTOMER'], 
   'John Smith', '+353850000001', '1985-04-12', NOW(), NOW()),
  
  ('olivia.martin', 'olivia.martin@example.com', 
   '$2b$12$clienthash002', 1, ARRAY['CUSTOMER'], 
   'Olivia Martin', '+353850000002', '1990-08-21', NOW(), NOW()),
  
  ('david.taylor', 'david.taylor@example.com', 
   '$2b$12$clienthash003', 1, ARRAY['CUSTOMER'], 
   'David Taylor', '+353850000003', '1978-02-18', NOW(), NOW()),
  
  ('sophia.anderson', 'sophia.anderson@example.com', 
   '$2b$12$clienthash004', 1, ARRAY['CUSTOMER'], 
   'Sophia Anderson', '+353850000004', '1995-10-03', NOW(), NOW()),
  
  ('james.thomas', 'james.thomas@example.com', 
   '$2b$12$clienthash005', 1, ARRAY['CUSTOMER'], 
   'James Thomas', '+353850000005', '1982-12-29', NOW(), NOW()),
  
  ('liam.harris', 'liam.harris@example.com', 
   '$2b$12$clienthash006', 1, ARRAY['CUSTOMER'], 
   'Liam Harris', '+353850000006', '1988-03-15', NOW(), NOW()),
  
  ('amelia.walker', 'amelia.walker@example.com', 
   '$2b$12$clienthash007', 1, ARRAY['CUSTOMER'], 
   'Amelia Walker', '+353850000007', '1992-11-07', NOW(), NOW()),
  
  ('noah.hall', 'noah.hall@example.com', 
   '$2b$12$clienthash008', 1, ARRAY['CUSTOMER'], 
   'Noah Hall', '+353850000008', '1975-06-25', NOW(), NOW()),
  
  ('mia.allen', 'mia.allen@example.com', 
   '$2b$12$clienthash009', 1, ARRAY['CUSTOMER'], 
   'Mia Allen', '+353850000009', '1998-01-30', NOW(), NOW()),
  
  ('oliver.young', 'oliver.young@example.com', 
   '$2b$12$clienthash010', 1, ARRAY['CUSTOMER'], 
   'Oliver Young', '+353850000010', '1986-09-17', NOW(), NOW())
ON CONFLICT (username) DO NOTHING;

-- Grant privileges to auth_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO auth_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO auth_user;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Verify tables created
\dt

-- Count test users
SELECT 'Users created: ' || COUNT(*) FROM users;

-- List test users
SELECT id, username, email, client_name, created_on FROM users ORDER BY username;

-- ============================================================
-- END OF SETUP
-- ============================================================
