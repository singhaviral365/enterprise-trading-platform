package org.example.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.AccountLinkConflictException;
import org.example.backend.exceptions.DomainException;
import org.example.backend.exceptions.DuplicateOrderException;
import org.example.backend.exceptions.InsufficientFundsException;
import org.example.backend.exceptions.InsufficientHoldingsException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.backend.exceptions.OrderNotCancellableException;
import org.example.backend.exceptions.OrderNotFoundException;
import org.example.backend.exceptions.UnauthorisedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<ErrorResponse> handleDomainErrors(
            DomainException ex) {

        HttpStatus status = switch (ex) {
            case UnauthorisedException ignored ->
                    HttpStatus.UNAUTHORIZED;

            case AccountNotActiveException ignored ->
                    HttpStatus.FORBIDDEN;

            case AccountNotFoundException ignored ->
                    HttpStatus.NOT_FOUND;

            case AccountLinkConflictException ignored ->
                    HttpStatus.CONFLICT;

            case InstrumentNotFoundException ignored ->
                    HttpStatus.NOT_FOUND;

            case InsufficientFundsException ignored ->
                    HttpStatus.BAD_REQUEST;

            case InsufficientHoldingsException ignored ->
                    HttpStatus.CONFLICT;

            case DuplicateOrderException ignored ->
                    HttpStatus.CONFLICT;

            case OptimisticLockException ignored ->
                    HttpStatus.CONFLICT;

            case OrderNotCancellableException ignored ->
                    HttpStatus.CONFLICT;

            case OrderNotFoundException ignored ->
                    HttpStatus.NOT_FOUND;

            default ->
                    HttpStatus.UNPROCESSABLE_ENTITY;
        };

        return ResponseEntity
                .status(status)
                .body(
                        new ErrorResponse(
                                ex.getErrorCode(),
                                ex.getMessage()
                        )
                );
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            ConstraintViolationException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<ErrorResponse> handleValidationErrors(
            Exception ex) {

        return ResponseEntity
                .unprocessableEntity()
                .body(
                        new ErrorResponse(
                                "VAL-422",
                                validationMessage(ex)
                        )
                );
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(
            NoHandlerFoundException ex) {

        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(
                        new ErrorResponse(
                                "RES-404",
                                "Resource not found"
                        )
                );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleFallback(
            Exception ex,
            HttpServletRequest request) {

        logger.error("Unhandled exception on {} {}", request.getMethod(), request.getRequestURI(), ex);

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(
                        new ErrorResponse(
                                "SRV-500",
                                "Internal server error"
                        )
                );
    }

    private static String validationMessage(Exception ex) {

        if (ex instanceof MethodArgumentNotValidException manve) {

            FieldError fieldError =
                    manve.getBindingResult().getFieldError();

            if (fieldError != null) {
                return "Invalid input";
            }
        }

        return "Invalid input";
    }
}