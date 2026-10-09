package org.example.backend.strategy.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * The change is not possible in the strategy's current status: a finished strategy cannot be switched on, a switched-off one
 * cannot be switched off again, one whose window has closed cannot be re-armed. Catalogue {@code STR-409}.
 */
public final class StrategyNotChangeableException extends DomainException {

    public StrategyNotChangeableException() {
        super("STR-409", "This strategy can no longer be changed that way");
    }
}
