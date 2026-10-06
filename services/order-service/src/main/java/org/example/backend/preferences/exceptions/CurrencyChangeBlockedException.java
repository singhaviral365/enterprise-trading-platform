package org.example.backend.preferences.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * The account currency cannot be changed right now because orders are still open. An open order is waiting to be
 * filled against the balance and prices in the current currency, so converting underneath it would make the executor
 * compare two different currencies. Catalogue {@code ACC-409}.
 */
public final class CurrencyChangeBlockedException extends DomainException {

    private final long accountId;
    private final long openOrders;

    public CurrencyChangeBlockedException(long accountId, long openOrders) {
        super("ACC-409", "Account currency cannot be changed while orders are open");
        this.accountId = accountId;
        this.openOrders = openOrders;
    }

    public long getAccountId() {
        return accountId;
    }

    public long getOpenOrders() {
        return openOrders;
    }
}
