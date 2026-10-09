package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

/** The account already holds the maximum number of watchlists. Catalogue {@code WTL-422}. */
public final class WatchlistLimitExceededException extends DomainException {

    private final long accountId;
    private final int limit;

    public WatchlistLimitExceededException(long accountId, int limit) {
        super("WTL-422", "Watchlist limit reached");
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
