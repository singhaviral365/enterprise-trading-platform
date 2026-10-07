package org.example.backend.strategy.exceptions;

import org.example.backend.exceptions.DomainException;

/** The token's user does not own the account. Catalogue {@code ACC-403}, as for every other module. */
public final class StrategyAccessDeniedException extends DomainException {

    private final long accountId;

    public StrategyAccessDeniedException(long accountId) {
        super("ACC-403", "Account not reachable with this token");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
