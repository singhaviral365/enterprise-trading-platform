package org.example.backend.exceptions;

public final class UnauthorisedException extends DomainException {

    public UnauthorisedException() {
        super("AUTH-401", "Unauthorised");
    }
}
