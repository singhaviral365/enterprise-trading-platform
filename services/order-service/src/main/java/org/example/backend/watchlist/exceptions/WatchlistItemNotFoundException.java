package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

public final class WatchlistItemNotFoundException extends DomainException {

    private final long watchlistId;
    private final String tickerSymbol;

    public WatchlistItemNotFoundException(long watchlistId, String tickerSymbol) {
        super("WLI-404", "Stock not found in watchlist");
        this.watchlistId = watchlistId;
        this.tickerSymbol = tickerSymbol;
    }

    public long getWatchlistId() {
        return watchlistId;
    }

    public String getTickerSymbol() {
        return tickerSymbol;
    }
}

