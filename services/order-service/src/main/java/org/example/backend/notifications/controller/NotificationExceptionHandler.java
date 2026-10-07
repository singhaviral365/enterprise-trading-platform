package org.example.backend.notifications.controller;

import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.DomainException;
import org.example.backend.notifications.exceptions.NotificationAccessDeniedException;
import org.example.backend.notifications.exceptions.NotificationNotFoundException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps the notifications module's own errors to HTTP statuses, in the platform's {@code {errorCode, message}}
 * envelope. Ordered ahead of the shared handler so the module owns its mapping and the shared
 * {@code ApiExceptionHandler} is not edited.
 */
@RestControllerAdvice(assignableTypes = NotificationController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class NotificationExceptionHandler {

    @ExceptionHandler({NotificationAccessDeniedException.class, NotificationNotFoundException.class})
    public ResponseEntity<ErrorResponse> handle(DomainException ex) {
        HttpStatus status = ex instanceof NotificationAccessDeniedException ? HttpStatus.FORBIDDEN : HttpStatus.NOT_FOUND;
        return ResponseEntity.status(status).body(new ErrorResponse(ex.getErrorCode(), ex.getMessage()));
    }
}
