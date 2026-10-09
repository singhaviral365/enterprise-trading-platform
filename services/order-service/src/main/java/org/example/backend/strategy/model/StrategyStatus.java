package org.example.backend.strategy.model;

/**
 * Where a strategy is in its life. The database enforces which moves are possible (strategy-schema.sql); this is the
 * same list, for the code that reads it.
 */
public enum StrategyStatus {
    /** Armed: the executor may act on it. */
    ACTIVE,
    /** Claimed by the executor for one run. Only the executor sets this, and only from ACTIVE. */
    EXECUTING,
    /** Switched off by the customer. Can be switched back on. */
    DISABLED,
    /** Ran as many times as it was allowed to. Final. */
    EXECUTED,
    /** Withdrawn by the customer. Final. */
    CANCELLED,
    /** Its end date passed before it finished. Final. */
    EXPIRED,
    /** Stopped by the platform after repeated failures. Final. */
    FAILED;

    public boolean isFinal() {
        return this == EXECUTED || this == CANCELLED || this == EXPIRED || this == FAILED;
    }
}
