package org.example.backend.strategy.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * An order arrived with a strategy executor's token but is not the order that strategy is currently allowed to place:
 * the strategy is not claimed (it was disabled, cancelled or already finished), or the order differs from it in account,
 * instrument, side, quantity or idempotency key. Catalogue {@code STR-403}.
 *
 * <p>The message is the same for every cause: the executor does not need to be told which check failed, and an attacker
 * holding a stolen token learns nothing about the strategy. The cause is for the server log only.
 */
public final class StrategyOrderRejectedException extends DomainException {

    private final String reason;

    public StrategyOrderRejectedException(String reason) {
        super("STR-403", "This order is not permitted for the strategy");
        this.reason = reason;
    }

    public String getReason() {
        return reason;
    }
}
