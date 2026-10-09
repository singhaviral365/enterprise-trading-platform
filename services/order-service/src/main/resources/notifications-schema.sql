-- Customer notifications module tables. Loaded after schema.sql (see spring.sql.init.schema-locations).
-- Safe to run on every start: every statement is idempotent. The same statements, for a database created before this
-- module existed, are in databases/PostgreSQL/migrations/add_notifications_and_price_alerts.sql.
--
-- A notification is one row, keyed by the event that caused it (event_key), so a replayed event inserts nothing.
-- The in-app inbox is that row: recording it durably IS delivering it in-app. Every other channel gets a delivery row,
-- so queued, sent, failed and skipped are tracked per channel, separately from the Kafka offset.

CREATE TABLE IF NOT EXISTS notification (
    notification_id BIGSERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    category VARCHAR(20) NOT NULL
        CONSTRAINT chk_notification_category CHECK (category IN ('ORDER_STATUS', 'WATCHLIST_ALERTS', 'STRATEGY_EXECUTION')),
    -- Idempotency key: the Kafka eventId for an order outcome, a stable alert key for a price alert.
    event_key VARCHAR(120) NOT NULL,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(500) NOT NULL,
    -- The channels resolved from Customer Preferences at send time, comma separated; NONE if the customer opted out.
    channels VARCHAR(30) NOT NULL,
    -- True when IN_APP is one of the resolved channels: only those appear in the bell.
    in_app BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ,
    CONSTRAINT fk_notification_account
        FOREIGN KEY (account_id)
        REFERENCES account(account_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_notification_event_key
        UNIQUE (event_key)
);

-- Self-heal: a table made before strategy notifications existed carries the older list of categories, and CREATE TABLE
-- IF NOT EXISTS leaves it as it is. Put the current list in place; the rows already there all satisfy it.
ALTER TABLE notification
    DROP CONSTRAINT IF EXISTS chk_notification_category;
ALTER TABLE notification
    ADD CONSTRAINT chk_notification_category
        CHECK (category IN ('ORDER_STATUS', 'WATCHLIST_ALERTS', 'STRATEGY_EXECUTION'));

-- The inbox: one account's in-app notifications, newest first.
CREATE INDEX IF NOT EXISTS idx_notification_inbox
    ON notification(account_id, created_at DESC, notification_id DESC)
    WHERE in_app;

-- The unread badge.
CREATE INDEX IF NOT EXISTS idx_notification_unread
    ON notification(account_id)
    WHERE in_app AND read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_delivery (
    delivery_id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL,
    channel VARCHAR(5) NOT NULL
        CONSTRAINT chk_notification_delivery_channel CHECK (channel IN ('EMAIL', 'SMS')),
    -- QUEUED: recorded, not yet attempted. SENT: the provider accepted it. FAILED: attempts exhausted.
    -- SKIPPED: nothing could be sent by design (channel switched off, not provisioned, or no address held).
    status VARCHAR(7) NOT NULL
        CONSTRAINT chk_notification_delivery_status CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    -- A short reason, never a credential or an address.
    detail VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_delivery_notification
        FOREIGN KEY (notification_id)
        REFERENCES notification(notification_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_notification_delivery_channel
        UNIQUE (notification_id, channel)
);

-- What the dispatcher sweeps.
CREATE INDEX IF NOT EXISTS idx_notification_delivery_queued
    ON notification_delivery(created_at)
    WHERE status = 'QUEUED';

-- Where to reach an account (email, phone) is kept on the account row itself: see account.email and account.phone_no
-- in schema.sql.
