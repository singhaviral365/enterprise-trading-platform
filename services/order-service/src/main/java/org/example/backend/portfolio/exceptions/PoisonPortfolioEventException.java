package org.example.backend.portfolio.exceptions;

/** A trade-events message that can never be processed. It is dead-lettered at once instead of being retried. */
public final class PoisonPortfolioEventException extends RuntimeException {

    public PoisonPortfolioEventException(String message) {
        super(message);
    }

    public PoisonPortfolioEventException(String message, Throwable cause) {
        super(message, cause);
    }
}
