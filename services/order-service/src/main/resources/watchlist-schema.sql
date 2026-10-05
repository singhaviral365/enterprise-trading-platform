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
