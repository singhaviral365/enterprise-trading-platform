package org.example.backend.exceptions;

public final class OptimisticLockException extends DomainException {

    public OptimisticLockException() {
        super(
                "ORD-409",
                "Order could not be completed because the account was updated concurrently"
        );
    }
}