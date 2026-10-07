package org.example.backend.signals.controller;

import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.DomainException;
import org.example.backend.signals.exceptions.AssistantDisabledException;
import org.example.backend.signals.exceptions.AssistantRateLimitedException;
import org.example.backend.signals.exceptions.InsufficientHistoryException;
import org.example.backend.signals.exceptions.SignalAccessDeniedException;
import org.example.backend.signals.exceptions.SignalDataUnavailableException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps the signals module's own errors to HTTP statuses, in the platform's {@code {errorCode, message}} envelope. Ordered ahead
 * of the shared handler so the module owns its mapping and the shared {@code ApiExceptionHandler} is not edited.
 */
@RestControllerAdvice(assignableTypes = SignalController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SignalExceptionHandler {

    @ExceptionHandler({
            SignalAccessDeniedException.class,
            AssistantDisabledException.class,
            InsufficientHistoryException.class,
            SignalDataUnavailableException.class,
            AssistantRateLimitedException.class
    })
    public ResponseEntity<ErrorResponse> handle(DomainException ex) {
        HttpStatus status = switch (ex) {
            case SignalAccessDeniedException ignored -> HttpStatus.FORBIDDEN;
            case AssistantDisabledException ignored -> HttpStatus.FORBIDDEN;
            case InsufficientHistoryException ignored -> HttpStatus.UNPROCESSABLE_ENTITY;
            case SignalDataUnavailableException ignored -> HttpStatus.SERVICE_UNAVAILABLE;
            case AssistantRateLimitedException ignored -> HttpStatus.TOO_MANY_REQUESTS;
            default -> HttpStatus.UNPROCESSABLE_ENTITY;
        };

        ResponseEntity.BodyBuilder response = ResponseEntity.status(status);
        if (ex instanceof AssistantRateLimitedException limited) {
            response.header(HttpHeaders.RETRY_AFTER, String.valueOf(limited.getRetryAfterSeconds()));
        }
        return response.body(new ErrorResponse(ex.getErrorCode(), ex.getMessage()));
    }
}
