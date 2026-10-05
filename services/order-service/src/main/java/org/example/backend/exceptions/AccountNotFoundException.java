package org.example.backend.exceptions;

/** Rule 1: the account referenced by an order or query does not exist. Catalogue {@code ACC-404}. */
public final class AccountNotFoundException extends DomainException {

    private final long accountId;

    public AccountNotFoundException(long accountId) {
        super("ACC-404", "Account not found");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
