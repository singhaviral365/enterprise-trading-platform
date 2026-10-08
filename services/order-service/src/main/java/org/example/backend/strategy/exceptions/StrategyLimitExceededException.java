package org.example.backend.strategy.exceptions;

import org.example.backend.exceptions.DomainException;

/** The account already holds the largest number of open strategies it may. Catalogue {@code STR-422}. */
public final class StrategyLimitExceededException extends DomainException {

    private final long accountId;
    private final int limit;

    public StrategyLimitExceededException(long accountId, int limit) {
        super("STR-422", "Too many open strategies on this account");
        this.accountId = accountId;
        this.limit = limit;
    }

    public long getAccountId() {
        return accountId;
    }

    public int getLimit() {
        return limit;
    }
}
