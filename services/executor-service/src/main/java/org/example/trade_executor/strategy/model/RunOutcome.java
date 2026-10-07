package org.example.trade_executor.strategy.model;

/** What came of one attempt to run a strategy, as written to {@code strategy_run}. The order-service reads the same values. */
public enum RunOutcome {
    /** The order was placed. */
    ORDERED,
    /** The order had already been placed by an earlier attempt of the same run. */
    DUPLICATE,
    /** One of the strategy's own limits stopped the order before it was placed. */
    BLOCKED_LIMIT,
    /** The order route refused the order. */
    REJECTED,
    /** The order route could not be reached, or answered with a server error. */
    API_ERROR,
    /** The quote was too old to act on. */
    STALE,
    /** The strategy was switched off before the order was sent. */
    DISABLED
}
