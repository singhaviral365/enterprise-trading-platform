-- Watchlist module tables. Loaded after schema.sql (see spring.sql.init.schema-locations).
-- Safe to run on every start: every statement is idempotent.

CREATE TABLE IF NOT EXISTS watchlist (
    watchlist_id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_watchlist_account
        FOREIGN KEY (account_id)
        REFERENCES account(account_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_watchlist_account_name
        UNIQUE (account_id, name),
    CONSTRAINT chk_watchlist_name
        CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_account
    ON watchlist(account_id);

CREATE TABLE IF NOT EXISTS watchlist_item (
    watchlist_id BIGINT NOT NULL,
    ticker_symbol VARCHAR(20) NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (watchlist_id, ticker_symbol),
    CONSTRAINT fk_watchlist_item_watchlist
        FOREIGN KEY (watchlist_id)
        REFERENCES watchlist(watchlist_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_watchlist_item_instrument
        FOREIGN KEY (ticker_symbol)
        REFERENCES instrument(instrument_ticker)
);

-- executor-service's market poller reads DISTINCT ticker_symbol from this table.
CREATE INDEX IF NOT EXISTS idx_watchlist_item_ticker
    ON watchlist_item(ticker_symbol);

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
