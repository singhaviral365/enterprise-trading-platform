package org.example.backend.exceptions;

public class OptimisticLockException extends RuntimeException {

    public OptimisticLockException() {
        super("Optimistic lock conflict");
    }

    public OptimisticLockException(String message) {
        super(message);
    }
}

