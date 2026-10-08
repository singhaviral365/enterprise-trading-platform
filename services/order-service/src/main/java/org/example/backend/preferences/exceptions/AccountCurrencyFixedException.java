package org.example.backend.preferences.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * Somebody tried to save a different account currency. The currency is chosen once, when the account is opened, and is
 * read-only afterwards: everything stored "in the account currency" (orders, holdings, balances, cost basis) is stable for
 * the life of the account. Catalogue {@code CUR-409}.
 */
public final class AccountCurrencyFixedException extends DomainException {

    private final long accountId;

    public AccountCurrencyFixedException(long accountId) {
        super("CUR-409", "The account currency is set when the account is opened and cannot be changed.");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
