package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

/** The watchlist already holds the maximum number of instruments. Catalogue {@code WLI-422}. */
public final class WatchlistItemLimitExceededException extends DomainException {

    private final long watchlistId;
    private final int limit;

    public WatchlistItemLimitExceededException(long watchlistId, int limit) {
        super("WLI-422", "Watchlist item limit reached");
        this.watchlistId = watchlistId;
        this.limit = limit;
    }

    public long getWatchlistId() {
        return watchlistId;
    }

    public int getLimit() {
        return limit;
    }
}
