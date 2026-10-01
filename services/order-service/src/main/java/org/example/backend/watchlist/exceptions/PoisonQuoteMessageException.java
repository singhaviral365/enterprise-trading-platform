package org.example.backend.watchlist.exceptions;

/**
 * A market-data message that can never be processed (bad JSON, missing symbol, non-positive price).
 * Not retried: the consumer's error handler sends it straight to {@code market-data.DLT}.
 */
public final class PoisonQuoteMessageException extends RuntimeException {

    public PoisonQuoteMessageException(String message) {
        super(message);
    }

    public PoisonQuoteMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}
