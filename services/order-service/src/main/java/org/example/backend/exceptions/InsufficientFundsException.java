package org.example.backend.exceptions;

import java.math.BigDecimal;

/** Rule 6: a BUY costs more than the account's available cash balance. Catalogue {@code ORD-400}. */
public final class InsufficientFundsException extends DomainException {

    private final long accountId;
    private final BigDecimal required;
    private final BigDecimal available;

    public InsufficientFundsException(long accountId, BigDecimal required, BigDecimal available) {
        super("ORD-400", "Insufficient funds");
        this.accountId = accountId;
        this.required = required;
        this.available = available;
    }

    public long getAccountId() {
        return accountId;
    }

    public BigDecimal getRequired() {
        return required;
    }

    public BigDecimal getAvailable() {
        return available;
    }
}
