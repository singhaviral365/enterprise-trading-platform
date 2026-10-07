package org.example.backend.portfolio.controller;

import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.DomainException;
import org.example.backend.portfolio.exceptions.InvalidDateRangeException;
import org.example.backend.portfolio.exceptions.PerformanceDisabledException;
import org.example.backend.portfolio.exceptions.PortfolioAccessDeniedException;
import org.example.backend.portfolio.exceptions.PricingUnavailableException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Maps the portfolio module's errors to the contract's catalogue: {@code ACC-403}, {@code ACC-404}, {@code VAL-422} and
 * {@code MKT-503}, in the platform's {@code {errorCode, message}} envelope. Ordered ahead of the shared handler so the
 * module owns its mapping and the shared {@code ApiExceptionHandler} is not edited. Anything else (a missing token, for
 * instance) falls through to the shared handler.
 */
@RestControllerAdvice(assignableTypes = {PortfolioController.class, PerformanceController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class PortfolioExceptionHandler {

    @ExceptionHandler({
            PortfolioAccessDeniedException.class,
            AccountNotFoundException.class,
            InvalidDateRangeException.class,
            PricingUnavailableException.class,
            PerformanceDisabledException.class})
    public ResponseEntity<ErrorResponse> handle(DomainException ex) {
        HttpStatus status;
        if (ex instanceof PortfolioAccessDeniedException) {
            status = HttpStatus.FORBIDDEN;
        } else if (ex instanceof AccountNotFoundException) {
            status = HttpStatus.NOT_FOUND;
        } else if (ex instanceof InvalidDateRangeException) {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
        } else {
            status = HttpStatus.SERVICE_UNAVAILABLE;
        }
        return ResponseEntity.status(status).body(new ErrorResponse(ex.getErrorCode(), ex.getMessage()));
    }

    /** A date that is not a date, or an id that is not a number: the contract's "invalid input". */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleBadParameter(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(new ErrorResponse("VAL-422", "Invalid input"));
    }
}
