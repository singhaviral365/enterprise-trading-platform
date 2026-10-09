package org.example.backend.signals.exceptions;

import org.example.backend.exceptions.DomainException;

/** Price history could not be fetched and none is held to fall back on. Catalogue {@code SIG-503}. */
public final class SignalDataUnavailableException extends DomainException {

    public SignalDataUnavailableException() {
        super("SIG-503", "Price history is temporarily unavailable");
    }
}
