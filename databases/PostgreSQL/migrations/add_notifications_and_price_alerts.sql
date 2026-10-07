-- Adds Customer Notifications and watchlist price alerts to a database created before they existed.
-- Safe to run more than once: every statement is idempotent, and nothing is dropped except one check constraint that
-- is immediately re-created. Run with:  psql -d trading_db -f add_notifications_and_price_alerts.sql
-- (The Trade API also runs the same statements itself at start-up: see spring.sql.init.schema-locations.)
-- Needs the account, watchlist and watchlist_item tables to exist already. Also adds account.email and
-- account.phone_no.

BEGIN;

-- ---------------------------------------------------------------------------------------------------------------------
-- Price alerts. One alert per watchlist entry, as columns on the entry itself: an alert is a direction and a target on
-- an instrument the customer is already watching, so it needs no table of its own, and "above and below at once" cannot
-- be represented. All alert columns are NULL while the entry has no alert, and are set and cleared together.
-- Same statements, for a database created before this module had alerts, in
-- databases/PostgreSQL/migrations/add_notifications_and_price_alerts.sql.
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_direction VARCHAR(5)
        CONSTRAINT chk_watchlist_item_alert_direction CHECK (alert_direction IN ('ABOVE', 'BELOW'));
ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_target_price NUMERIC(19, 4)
        CONSTRAINT chk_watchlist_item_alert_target CHECK (alert_target_price > 0);
ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_status VARCHAR(9)
        CONSTRAINT chk_watchlist_item_alert_status CHECK (alert_status IN ('ACTIVE', 'TRIGGERED'));
ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_set_at TIMESTAMPTZ;
ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_triggered_at TIMESTAMPTZ;
ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_trigger_price NUMERIC(19, 4);
-- How the hand-over to Customer Notifications went for a triggered alert.
ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_delivery VARCHAR(11)
        CONSTRAINT chk_watchlist_item_alert_delivery CHECK (alert_delivery IN ('PENDING', 'HANDED_OVER', 'FAILED'));
ALTER TABLE watchlist_item
    ADD COLUMN IF NOT EXISTS alert_delivery_attempts INTEGER NOT NULL DEFAULT 0;

-- The alert is either entirely absent or entirely described.
ALTER TABLE watchlist_item
    DROP CONSTRAINT IF EXISTS chk_watchlist_item_alert_shape;
ALTER TABLE watchlist_item
    ADD CONSTRAINT chk_watchlist_item_alert_shape CHECK (
        (alert_status IS NULL
            AND alert_direction IS NULL AND alert_target_price IS NULL AND alert_set_at IS NULL
            AND alert_triggered_at IS NULL AND alert_trigger_price IS NULL AND alert_delivery IS NULL)
        OR
        (alert_status = 'ACTIVE'
            AND alert_direction IS NOT NULL AND alert_target_price IS NOT NULL AND alert_set_at IS NOT NULL
            AND alert_triggered_at IS NULL AND alert_trigger_price IS NULL AND alert_delivery IS NULL)
        OR
        (alert_status = 'TRIGGERED'
            AND alert_direction IS NOT NULL AND alert_target_price IS NOT NULL AND alert_set_at IS NOT NULL
            AND alert_triggered_at IS NOT NULL AND alert_trigger_price IS NOT NULL AND alert_delivery IS NOT NULL));

-- The index behind the per-quote lookup: only entries with an ACTIVE alert, found by symbol. It is what loads the
-- in-memory alert index at start-up, and what the guarded "fire" update walks.
CREATE INDEX IF NOT EXISTS idx_watchlist_item_active_alert
    ON watchlist_item(ticker_symbol)
    WHERE alert_status = 'ACTIVE';

-- Triggered alerts whose hand-over has not succeeded yet, for the bounded retry.
CREATE INDEX IF NOT EXISTS idx_watchlist_item_alert_undelivered
    ON watchlist_item(alert_triggered_at)
    WHERE alert_status = 'TRIGGERED' AND alert_delivery IN ('PENDING', 'FAILED');

CREATE TABLE IF NOT EXISTS notification (
    notification_id BIGSERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    category VARCHAR(20) NOT NULL
        CONSTRAINT chk_notification_category CHECK (category IN ('ORDER_STATUS', 'WATCHLIST_ALERTS')),
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

-- Where to reach the customer lives on the account row itself (a copy of what was given at account set-up: the Trade
-- API cannot read the Auth database).
-- Databases created before the contact columns existed pick them up here (the rows keep NULL until the customer's
-- account is set up again or the values are filled in by hand).
ALTER TABLE account ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE account ADD COLUMN IF NOT EXISTS phone_no VARCHAR(20);
ALTER TABLE account DROP CONSTRAINT IF EXISTS chk_account_email;
ALTER TABLE account ADD CONSTRAINT chk_account_email
    CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+$');
ALTER TABLE account DROP CONSTRAINT IF EXISTS chk_account_phone_no;
ALTER TABLE account ADD CONSTRAINT chk_account_phone_no
    CHECK (phone_no IS NULL OR phone_no ~ '^\+?[0-9[:space:]()-]{10,20}$');

-- An earlier draft of this change kept the email in a notification_contact table. If a database has it, carry the
-- addresses over and drop it.
DO $$
BEGIN
    IF to_regclass('notification_contact') IS NOT NULL THEN
        UPDATE account a
        SET email = c.email
        FROM notification_contact c
        WHERE c.account_id = a.account_id
          AND a.email IS NULL
          AND c.email IS NOT NULL;
        DROP TABLE notification_contact;
    END IF;
END
$$;

COMMIT;
