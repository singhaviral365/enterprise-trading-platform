package org.example.backend.signals.exceptions;

import org.example.backend.exceptions.DomainException;

/** The instrument has too few trading days of history to compute the averages from. Catalogue {@code SIG-422}. */
public final class InsufficientHistoryException extends DomainException {

    private final int have;
    private final int need;

    public InsufficientHistoryException(int have, int need) {
        super("SIG-422", "Not enough price history to compute a signal");
        this.have = have;
        this.need = need;
    }

    public int getHave() {
        return have;
    }

    public int getNeed() {
        return need;
    }
}
