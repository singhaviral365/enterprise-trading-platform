package org.example.trade_executor.executor;

public class PoisonOrderMessageException extends RuntimeException {

    public PoisonOrderMessageException(String message) {
        super(message);
    }

    public PoisonOrderMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}

