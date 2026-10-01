package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

public final class WatchlistItemAlreadyExistsException extends DomainException {

    private final long watchlistId;
    private final String tickerSymbol;

    public WatchlistItemAlreadyExistsException(long watchlistId, String tickerSymbol) {
        super("WLI-409", "Stock is already in the watchlist");
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

