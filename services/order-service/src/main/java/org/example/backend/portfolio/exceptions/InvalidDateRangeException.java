package org.example.backend.portfolio.exceptions;

import org.example.backend.exceptions.DomainException;

/** The request failed field validation, for example {@code from} later than {@code to}. Catalogue {@code VAL-422}. */
public final class InvalidDateRangeException extends DomainException {

    public InvalidDateRangeException(String message) {
        super("VAL-422", message);
    }
}
