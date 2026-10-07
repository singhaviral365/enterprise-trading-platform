package org.example.backend.portfolio.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * The token is valid but its user does not own the account in the path. Catalogue {@code ACC-403}: it is a 403, never a
 * 404, because someone probing another customer's portfolio is an access-control failure, not a lookup miss.
 */
public final class PortfolioAccessDeniedException extends DomainException {

    private final long accountId;

    public PortfolioAccessDeniedException(long accountId) {
        super("ACC-403", "Account not accessible");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
