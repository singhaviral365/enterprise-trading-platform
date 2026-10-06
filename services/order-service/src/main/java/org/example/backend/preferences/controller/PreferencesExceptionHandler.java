package org.example.backend.preferences.controller;

import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.DomainException;
import org.example.backend.preferences.exceptions.CurrencyChangeBlockedException;
import org.example.backend.preferences.exceptions.PreferencesAccessDeniedException;
import org.example.backend.preferences.exceptions.UnsupportedCurrencyException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps the preferences module's own errors to HTTP statuses, in the platform's {@code {errorCode, message}}
 * envelope. Ordered ahead of the shared handler so the module owns its mapping and the shared
 * {@code ApiExceptionHandler} is not edited. An unknown account ({@code ACC-404}) and a malformed body
 * ({@code VAL-422}) are the shared handler's.
 */
@RestControllerAdvice(assignableTypes = PreferencesController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class PreferencesExceptionHandler {

    @ExceptionHandler({
            PreferencesAccessDeniedException.class,
            UnsupportedCurrencyException.class,
            CurrencyChangeBlockedException.class
    })
    public ResponseEntity<ErrorResponse> handle(DomainException ex) {
        HttpStatus status = switch (ex) {
            case PreferencesAccessDeniedException ignored -> HttpStatus.FORBIDDEN;
            case CurrencyChangeBlockedException ignored -> HttpStatus.CONFLICT;
            default -> HttpStatus.UNPROCESSABLE_ENTITY;
        };

        return ResponseEntity.status(status).body(new ErrorResponse(ex.getErrorCode(), ex.getMessage()));
    }
}
