package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

/** The token is valid but its account does not own the account being addressed. Catalogue {@code ACC-403}. */
public final class WatchlistAccessDeniedException extends DomainException {

    private final long accountId;

    public WatchlistAccessDeniedException(long accountId) {
        super("ACC-403", "Account not reachable with this token");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
