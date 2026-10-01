package org.example.backend.exceptions;

/**
 * Rule 7: a SELL requests more than the held quantity. Catalogue {@code ORD-409} — the same code
 * as {@link DuplicateOrderException}; the two are distinguished by exception type, not by code.
 */
public final class InsufficientHoldingsException extends DomainException {

    private final long accountId;
    private final String symbol;
    private final long requestedQuantity;
    private final long availableQuantity;

    public InsufficientHoldingsException(
            long accountId,
            String symbol,
            long requestedQuantity,
            long availableQuantity) {

        super("ORD-409", "Insufficient holdings");
        this.accountId = accountId;
        this.symbol = symbol;
        this.requestedQuantity = requestedQuantity;
        this.availableQuantity = availableQuantity;
    }

    public long getAccountId() {
        return accountId;
    }

    public String getSymbol() {
        return symbol;
    }

    public long getRequestedQuantity() {
        return requestedQuantity;
    }

    public long getAvailableQuantity() {
        return availableQuantity;
    }
}
