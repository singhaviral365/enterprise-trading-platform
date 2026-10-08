package org.example.backend.strategy.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * The latest known price already satisfies the trigger, so the strategy would trade the moment it was created. Catalogue
 * {@code STR-409}.
 */
public final class StrategyAlreadyReachedException extends DomainException {

    private final String tickerSymbol;

    public StrategyAlreadyReachedException(String tickerSymbol) {
        super("STR-409", "The trigger price has already been reached");
        this.tickerSymbol = tickerSymbol;
    }

    public String getTickerSymbol() {
        return tickerSymbol;
    }
}
