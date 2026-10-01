package org.example.backend.watchlist.exceptions;

import org.example.backend.exceptions.DomainException;

public final class WatchlistNameConflictException extends DomainException {

    private final long accountId;
    private final String name;

    public WatchlistNameConflictException(long accountId, String name) {
        super("WTL-409", "Watchlist with this name already exists");
        this.accountId = accountId;
        this.name = name;
    }

    public long getAccountId() {
        return accountId;
    }

    public String getName() {
        return name;
    }
}

