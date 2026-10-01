package org.example.trade_executor.executor;

public enum ExecutionRejectReason {
    OUTSIDE_MARKETABLE_RANGE,
    PRICE_UNAVAILABLE,
    INSTRUMENT_NOT_TRADABLE,
    ACCOUNT_NOT_ACTIVE,
    INSUFFICIENT_FUNDS,
    INSUFFICIENT_HOLDINGS
}

