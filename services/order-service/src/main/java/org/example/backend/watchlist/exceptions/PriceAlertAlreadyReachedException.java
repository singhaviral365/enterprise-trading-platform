package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * The latest known price has already reached the target, so the alert would fire the instant it was created.
 * Catalogue {@code ALR-409}.
 */
public final class PriceAlertAlreadyReachedException extends DomainException {

    private final String tickerSymbol;

    public PriceAlertAlreadyReachedException(String tickerSymbol) {
        super("ALR-409", "The target has already been reached");
        this.tickerSymbol = tickerSymbol;
    }

    public String getTickerSymbol() {
        return tickerSymbol;
    }
}
