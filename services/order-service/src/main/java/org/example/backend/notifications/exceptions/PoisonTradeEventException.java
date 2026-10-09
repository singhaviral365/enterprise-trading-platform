package org.example.backend.notifications.exceptions;

/**
 * A {@code trade-events} message that can never be processed (not JSON, missing the fields every notification needs).
 * Not retried: it is dead-lettered at once so it cannot stall the partition.
 */
public class PoisonTradeEventException extends RuntimeException {

    public PoisonTradeEventException(String message) {
        super(message);
    }

    public PoisonTradeEventException(String message, Throwable cause) {
        super(message, cause);
    }
}
