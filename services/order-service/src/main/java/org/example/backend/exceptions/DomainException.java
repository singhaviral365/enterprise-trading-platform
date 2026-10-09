package org.example.backend.exceptions;

/**
 * Base type for the six catalogued business-rule failures. Carries the
 * catalogue error code (e.g. {@code ACC-404}), never an HTTP status — Sprint 6
 * maps the code to a status and Sprint 7 maps it to a Kafka rejection reason,
 * each in one place, outside this module. The message is the catalogue
 * message and nothing else; anything an investigation needs belongs on a
 * typed field of the subclass, logged on the server, not folded into the
 * message (OWASP A05).
 *
 * <p>Quantity and price range checks have no member here: they are rejected
 * by {@code IllegalArgumentException} at construction of the DTO or the
 * entity, before a business rule is ever evaluated. A caller that skips
 * validation — the Trade Executor replaying a persisted order — hits that
 * same constructor check and gets the same {@code IllegalArgumentException},
 * not one of these six. That is a programming error, not a business outcome.
 */
public abstract class DomainException extends RuntimeException {

    private final String errorCode;

    protected DomainException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
