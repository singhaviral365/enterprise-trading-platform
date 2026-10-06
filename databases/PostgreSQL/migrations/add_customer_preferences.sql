-- ============================================================
-- ADD CUSTOMER PREFERENCES  (upgrade for an EXISTING trading_db)
-- PostgreSQL
-- ============================================================
-- Run this once against a database created before the customer preferences module existed. Nothing is dropped
-- and no data is lost; running it again is harmless (every statement is idempotent).
--
--   psql -U postgres -h localhost -d trading_db -f add_customer_preferences.sql
--
-- A brand new database does not need this file: create_schema.sql already contains the table, and
-- sample_data.sql seeds one row per sample account.
--
-- What it does
--   1. Creates customer_preference (one row per account) if it is missing.
--   2. Adds every column the module needs if it is missing, so a table from an earlier draft is brought up to date.
--   3. Back-fills one default row for every existing account, with the account's own currency as the preferred
--      currency. Accounts that already have a row are left exactly as they are.
-- ============================================================

BEGIN;

-- 1. The table ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_preference
(
    account_id INTEGER PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_customer_preference_account
        FOREIGN KEY (account_id)
        REFERENCES account(account_id)
        ON DELETE CASCADE
);

-- 2. The columns --------------------------------------------------------------

-- Display currency for estimates. account.currency never changes: balances, orders and holdings are stored in it.
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS preferred_currency CHAR(3) NOT NULL DEFAULT 'USD'
        CONSTRAINT chk_customer_preference_currency CHECK (preferred_currency ~ '^[A-Z]{3}$');

-- Alert channels (all false = no notifications).
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS channel_sms BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS channel_email BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS channel_in_app BOOLEAN NOT NULL DEFAULT TRUE;

-- Notification categories.
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS notify_order_status BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS notify_watchlist_alerts BOOLEAN NOT NULL DEFAULT TRUE;

-- Display formats.
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS date_format VARCHAR(16) NOT NULL DEFAULT 'MON_DD_YYYY'
        CONSTRAINT chk_customer_preference_date_format CHECK (
            date_format IN ('DD_MM_YYYY', 'MM_DD_YYYY', 'DD_MONTH_YYYY', 'DD_MON_YYYY', 'YYYY_MM_DD', 'MON_DD_YYYY'));
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS time_format VARCHAR(3) NOT NULL DEFAULT 'H12'
        CONSTRAINT chk_customer_preference_time_format CHECK (time_format IN ('H12', 'H24'));
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS number_format VARCHAR(2) NOT NULL DEFAULT 'US'
        CONSTRAINT chk_customer_preference_number_format CHECK (number_format IN ('US', 'IN'));

-- Assistant: true shows the chatbot icon.
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Light extras, all applied by the browser.
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS theme VARCHAR(6) NOT NULL DEFAULT 'SYSTEM'
        CONSTRAINT chk_customer_preference_theme CHECK (theme IN ('LIGHT', 'DARK', 'SYSTEM'));
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS landing_page VARCHAR(10) NOT NULL DEFAULT 'DASHBOARD'
        CONSTRAINT chk_customer_preference_landing_page CHECK (
            landing_page IN ('DASHBOARD', 'MARKET', 'POSITIONS', 'ORDERS'));
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS default_order_type VARCHAR(6) NOT NULL DEFAULT 'MARKET'
        CONSTRAINT chk_customer_preference_order_type CHECK (default_order_type IN ('MARKET', 'LIMIT'));

-- 3. A default row for every existing account -----------------------------------

INSERT INTO customer_preference (account_id, preferred_currency)
SELECT account_id, currency
FROM account
ON CONFLICT (account_id) DO NOTHING;

COMMIT;
