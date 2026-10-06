-- Customer preferences module table. Loaded after schema.sql (see spring.sql.init.schema-locations).
-- Safe to run on every start: every statement is idempotent. The same statements, plus a back-fill of one default
-- row per existing account, are in databases/PostgreSQL/migrations/add_customer_preferences.sql, which brings a
-- database created before this module existed up to date without dropping anything.
--
-- One row per account, created the first time the customer saves their settings. No row means "all defaults":
-- the Trade API answers with them (preferred currency = the account's own currency) and never needs the row.
-- Contact details (email address, phone number) are NOT stored here: a channel is only a switch, and the address
-- it points at stays where it already lives (the Auth service's user record).

CREATE TABLE IF NOT EXISTS customer_preference (
    account_id INTEGER PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_customer_preference_account
        FOREIGN KEY (account_id)
        REFERENCES account(account_id)
        ON DELETE CASCADE
);

-- Display currency for estimates. The account's own currency (account.currency) never changes: balances, orders and
-- holdings are stored in it (see documentation/readme/CURRENCY.md).
ALTER TABLE customer_preference
    ADD COLUMN IF NOT EXISTS preferred_currency CHAR(3) NOT NULL DEFAULT 'USD'
        CONSTRAINT chk_customer_preference_currency CHECK (preferred_currency ~ '^[A-Z]{3}$');

-- Alert channels. All three false means "No notifications".
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

-- Light extras, all applied by the browser, so they cost the backend nothing beyond this row.
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
