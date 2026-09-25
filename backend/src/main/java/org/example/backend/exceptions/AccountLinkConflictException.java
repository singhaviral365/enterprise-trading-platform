package org.example.backend.exceptions;

public final class AccountLinkConflictException extends DomainException {

	public AccountLinkConflictException(String message) {
		super("ACC-409", message);
	}
}
