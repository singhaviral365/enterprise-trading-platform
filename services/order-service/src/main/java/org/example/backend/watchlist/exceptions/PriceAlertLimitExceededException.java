package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

/** The account already holds the maximum number of active price alerts. Catalogue {@code ALR-422}. */
public final class PriceAlertLimitExceededException extends DomainException {

    private final long accountId;
    private final int limit;

    public PriceAlertLimitExceededException(long accountId, int limit) {
        super("ALR-422", "Price alert limit reached");
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
