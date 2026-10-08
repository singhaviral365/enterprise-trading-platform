package org.example.backend.signals.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * The customer has not switched the AI assistant on in Settings. Nothing about them is sent to the language model until they
 * do, so this is refused here and not left to the screen. Catalogue {@code AST-403}.
 */
public final class AssistantDisabledException extends DomainException {

    public AssistantDisabledException() {
        super("AST-403", "The AI assistant is switched off in Settings");
    }
}
