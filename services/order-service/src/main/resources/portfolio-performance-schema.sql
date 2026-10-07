-- Portfolio performance tables (end-of-day statements and the NAV curve). Loaded after portfolio-schema.sql (see
-- spring.sql.init.schema-locations). Safe to run on every start: every statement is idempotent. The same statements are part of
-- databases/PostgreSQL/migrations/create_schema.sql (a new database) and update_trading_db.sql (an existing one).
--
-- Live figures (market value, unrealised and day P&L as at now) are NOT stored: they are computed from the current quote on every
-- request. What is stored here is the history of CLOSED days: a daily close per symbol (a cache of what Fauxnance published),
-- and one statement per account per closed day, written once and not changed (except the last few days, which are recomputed when
-- a synthetic candle is later replaced by a real one).

-- Fauxnance daily candles, shared by every account: one row per symbol per trading day. close is the price as traded (what holdings
-- are valued with: share counts are never restated); adjclose is restated for splits and dividends (what benchmark returns use).
-- Symbols are Fauxnance symbols, upper case: AAPL, INFY.NS, SPY, and FX pairs such as FX:EURUSD.
CREATE TABLE IF NOT EXISTS price_candle_daily (
    symbol VARCHAR(32) NOT NULL,
    candle_date DATE NOT NULL,
    close NUMERIC(19, 6) NOT NULL,
    adjclose NUMERIC(19, 6) NOT NULL,
    currency CHAR(3),
    -- Fauxnance generated this row to bridge an upstream gap: the day is shown as estimated.
    synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (symbol, candle_date),
    CONSTRAINT chk_price_candle_close CHECK (close > 0),
    CONSTRAINT chk_price_candle_adjclose CHECK (adjclose > 0)
);

-- The statement of one CLOSED day for one account, in the account currency.
CREATE TABLE IF NOT EXISTS portfolio_nav_daily (
    account_id INTEGER NOT NULL,
    nav_date DATE NOT NULL,
    cash NUMERIC(19, 4) NOT NULL,
    holdings_value NUMERIC(19, 4) NOT NULL,
    -- V(d) = cash + holdings_value
    total_value NUMERIC(19, 4) NOT NULL,
    -- What the holdings cost (quantity * average cost), so unrealised_pnl = holdings_value - cost_basis.
    cost_basis NUMERIC(19, 4) NOT NULL,
    unrealised_pnl NUMERIC(19, 4) NOT NULL,
    -- Realised profit and loss booked on or before this day (from the ledger).
    realised_pnl_cumulative NUMERIC(19, 4) NOT NULL,
    -- External money (or securities) put in or taken out that day. On the first day it is the whole starting value.
    net_flow NUMERIC(19, 4) NOT NULL,
    -- V(d) - V(d-1) - F(d): trades swap cash for shares and cancel, so only prices move it.
    day_pnl NUMERIC(19, 4) NOT NULL,
    units NUMERIC(24, 8) NOT NULL,
    nav NUMERIC(19, 6) NOT NULL,
    -- Any price used that day was synthetic, missing, forward-filled over a gap, or an exchange rate was today's.
    estimated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id, nav_date),
    CONSTRAINT fk_portfolio_nav_account
        FOREIGN KEY (account_id)
        REFERENCES account(account_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_portfolio_nav_positive CHECK (nav > 0 AND units >= 0)
);
