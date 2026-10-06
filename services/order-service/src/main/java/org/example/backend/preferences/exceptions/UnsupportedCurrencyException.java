package org.example.backend.preferences.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * The display currency is a well-formed code that is not on the supported list. Catalogue {@code VAL-422}, the same
 * code the platform uses for any input it cannot accept.
 */
public final class UnsupportedCurrencyException extends DomainException {

    private final String currency;

    public UnsupportedCurrencyException(String currency) {
        super("VAL-422", "Invalid input");
        this.currency = currency;
    }

    public String getCurrency() {
        return currency;
    }
}
