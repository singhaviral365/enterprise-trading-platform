package org.example.backend.signals.exceptions;

import org.example.backend.exceptions.DomainException;

/** Too many assistant requests, from this customer or from everyone at once. Catalogue {@code AST-429}. */
public final class AssistantRateLimitedException extends DomainException {

    private final long retryAfterSeconds;

    public AssistantRateLimitedException(long retryAfterSeconds) {
        super("AST-429", "The assistant is busy: try again shortly");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
