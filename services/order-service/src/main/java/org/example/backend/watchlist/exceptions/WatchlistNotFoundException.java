package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

public final class WatchlistNotFoundException extends DomainException {

    private final long watchlistId;

    public WatchlistNotFoundException(long watchlistId) {
        super("WTL-404", "Watchlist not found");
        this.watchlistId = watchlistId;
    }

    public long getWatchlistId() {
        return watchlistId;
    }
}

