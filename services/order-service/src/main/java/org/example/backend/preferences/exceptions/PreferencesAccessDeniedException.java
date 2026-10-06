package org.example.backend.preferences.exceptions;

import org.example.backend.exceptions.DomainException;

/** The token is valid but its user does not own the account being addressed. Catalogue {@code ACC-403}. */
public final class PreferencesAccessDeniedException extends DomainException {

    private final long accountId;

    public PreferencesAccessDeniedException(long accountId) {
        super("ACC-403", "Account not reachable with this token");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
