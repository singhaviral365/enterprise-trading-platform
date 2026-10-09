-- Portfolio module table. Loaded after schema.sql (see spring.sql.init.schema-locations).
-- Safe to run on every start: every statement is idempotent. The same statements are part of
-- databases/PostgreSQL/migrations/create_schema.sql (a new database) and update_trading_db.sql (an existing one).
--
-- Realised profit and loss is booked once, when a sale is filled, and never recomputed from a price. One row per filled
-- sale; order_id is the key, so booking the same sale twice (a replayed event, or the reconciler overlapping the
-- consumer) inserts nothing. Live figures (market value, unrealised and day P&L) are NOT stored: they are computed from
-- the current quote on every request.

CREATE TABLE IF NOT EXISTS realised_pnl_entry (
    -- The sale. The idempotency key.
    order_id BIGINT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    ticker_symbol VARCHAR(20) NOT NULL,
    quantity BIGINT NOT NULL,
    fill_price NUMERIC(19, 4) NOT NULL,
    -- The weighted average cost just before this sale: a fact of that moment, not a live figure.
    average_cost_at_sale NUMERIC(19, 4) NOT NULL,
    realised_pnl NUMERIC(19, 4) NOT NULL,
    -- The account currency at booking (every stored price is in it).
    currency CHAR(3) NOT NULL,
    -- The order's transaction_date.
    booked_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_realised_pnl_account
        FOREIGN KEY (account_id)
        REFERENCES account(account_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_realised_pnl_quantity CHECK (quantity > 0),
    CONSTRAINT chk_realised_pnl_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_realised_pnl_account_booked
    ON realised_pnl_entry(account_id, booked_at);
