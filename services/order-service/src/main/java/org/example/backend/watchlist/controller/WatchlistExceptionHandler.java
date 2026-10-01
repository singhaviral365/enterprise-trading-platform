package org.example.backend.watchlist.controller;

import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.DomainException;
import org.example.backend.watchlist.exceptions.WatchlistAccessDeniedException;
import org.example.backend.watchlist.exceptions.WatchlistItemAlreadyExistsException;
import org.example.backend.watchlist.exceptions.WatchlistItemLimitExceededException;
import org.example.backend.watchlist.exceptions.WatchlistItemNotFoundException;
import org.example.backend.watchlist.exceptions.WatchlistLimitExceededException;
import org.example.backend.watchlist.exceptions.WatchlistNameConflictException;
import org.example.backend.watchlist.exceptions.WatchlistNotFoundException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps the watchlist module's own errors to HTTP statuses, in the platform's
 * {@code {errorCode, message}} envelope. Ordered ahead of the shared handler so the
 * module owns its mapping and the shared {@code ApiExceptionHandler} is not edited.
 */
@RestControllerAdvice(assignableTypes = WatchlistController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class WatchlistExceptionHandler {

    @ExceptionHandler({
            WatchlistAccessDeniedException.class,
            WatchlistNotFoundException.class,
            WatchlistItemNotFoundException.class,
            WatchlistNameConflictException.class,
            WatchlistItemAlreadyExistsException.class,
            WatchlistLimitExceededException.class,
            WatchlistItemLimitExceededException.class
    })
    public ResponseEntity<ErrorResponse> handle(DomainException ex) {
        HttpStatus status = switch (ex) {
            case WatchlistAccessDeniedException ignored -> HttpStatus.FORBIDDEN;
            case WatchlistNotFoundException ignored -> HttpStatus.NOT_FOUND;
            case WatchlistItemNotFoundException ignored -> HttpStatus.NOT_FOUND;
            case WatchlistNameConflictException ignored -> HttpStatus.CONFLICT;
            case WatchlistItemAlreadyExistsException ignored -> HttpStatus.CONFLICT;
            default -> HttpStatus.UNPROCESSABLE_ENTITY;
        };

        return ResponseEntity.status(status).body(new ErrorResponse(ex.getErrorCode(), ex.getMessage()));
    }
}
