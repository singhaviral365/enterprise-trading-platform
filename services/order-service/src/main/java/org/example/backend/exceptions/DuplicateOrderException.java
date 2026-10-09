package org.example.backend.exceptions;

/**
 * Rule 8: the idempotency key has already been used. Catalogue {@code ORD-409} — the same code as
 * {@link InsufficientHoldingsException}; the two are distinguished by exception type, not by code.
 * Enforced by the unique constraint on {@code orders.idempotency_key}, not by a read then a write.
 */
public final class DuplicateOrderException extends DomainException {

    private final String idempotencyKey;

    public DuplicateOrderException(String idempotencyKey) {
        super("ORD-409", "Duplicate order");
        this.idempotencyKey = idempotencyKey;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }
}
