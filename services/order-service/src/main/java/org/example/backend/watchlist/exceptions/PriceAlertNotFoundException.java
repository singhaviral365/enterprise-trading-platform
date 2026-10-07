package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

/** The watchlist entry has no price alert to clear. Catalogue {@code ALR-404}. */
public final class PriceAlertNotFoundException extends DomainException {

    private final long watchlistId;
    private final String tickerSymbol;

    public PriceAlertNotFoundException(long watchlistId, String tickerSymbol) {
        super("ALR-404", "No price alert on this stock");
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
