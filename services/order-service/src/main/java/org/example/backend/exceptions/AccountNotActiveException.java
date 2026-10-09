package org.example.backend.exceptions;

import org.example.backend.enums.AccountStatus;

/** Rule 2: the account exists but is not {@code ACTIVE}. Catalogue {@code ACC-403}. */
public final class AccountNotActiveException extends DomainException {

    private final long accountId;
    private final AccountStatus status;

    public AccountNotActiveException(long accountId, AccountStatus status) {
        super("ACC-403", "Account not active");
        this.accountId = accountId;
        this.status = status;
    }

    public long getAccountId() {
        return accountId;
    }

    public AccountStatus getStatus() {
        return status;
    }
}
