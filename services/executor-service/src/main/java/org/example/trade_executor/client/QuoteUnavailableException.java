package org.example.trade_executor.client;

public final class QuoteUnavailableException extends RuntimeException {

    private final String symbol;

    public QuoteUnavailableException(String symbol, String message) {
        super(message);
        this.symbol = symbol;
    }

    public QuoteUnavailableException(String symbol, String message, Throwable cause) {
        super(message, cause);
        this.symbol = symbol;
    }

    public String getSymbol() {
        return symbol;
    }
}

