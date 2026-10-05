package org.example.trade_executor.fx;

/** Raised when a currency cannot be converted: the rate service is down, rejected us, or lacks the currency. */
public class ExchangeRateUnavailableException extends RuntimeException {

    public ExchangeRateUnavailableException(String message) {
        super(message);
    }

    public ExchangeRateUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
