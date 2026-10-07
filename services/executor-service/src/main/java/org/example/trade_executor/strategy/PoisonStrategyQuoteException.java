package org.example.trade_executor.strategy;

/** A market-data message that can never be processed (malformed, no price). Not retried: it goes to the dead-letter topic. */
public class PoisonStrategyQuoteException extends RuntimeException {

    public PoisonStrategyQuoteException(String message) {
        super(message);
    }

    public PoisonStrategyQuoteException(String message, Throwable cause) {
        super(message, cause);
    }
}
