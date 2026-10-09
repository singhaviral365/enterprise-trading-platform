package org.example.backend.strategy.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * No strategy with this id belongs to the customer. A strategy that exists but belongs to another account is reported the
 * same way, so ids in use are not revealed. Catalogue {@code STR-404}.
 */
public final class StrategyNotFoundException extends DomainException {

    public StrategyNotFoundException() {
        super("STR-404", "Strategy not found");
    }
}
