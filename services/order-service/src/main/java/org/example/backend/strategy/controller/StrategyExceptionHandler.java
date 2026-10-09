package org.example.backend.strategy.controller;

import org.example.backend.controller.TradeController;
import org.example.backend.dto.ErrorResponse;
import org.example.backend.exceptions.DomainException;
import org.example.backend.strategy.exceptions.StrategyAccessDeniedException;
import org.example.backend.strategy.exceptions.StrategyAlreadyReachedException;
import org.example.backend.strategy.exceptions.StrategyLimitExceededException;
import org.example.backend.strategy.exceptions.StrategyNotChangeableException;
import org.example.backend.strategy.exceptions.StrategyNotFoundException;
import org.example.backend.strategy.exceptions.StrategyOrderRejectedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps the strategy module's own errors to HTTP statuses, in the platform's {@code {errorCode, message}} envelope. Ordered
 * ahead of the shared handler so the module owns its mapping and the shared {@code ApiExceptionHandler} is not edited.
 * {@link TradeController} is included only so a strategy order the gate refuses is answered here: no other error on that
 * controller is touched.
 */
@RestControllerAdvice(assignableTypes = {StrategyController.class, TradeController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class StrategyExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyExceptionHandler.class);

    @ExceptionHandler({
            StrategyAccessDeniedException.class,
            StrategyNotFoundException.class,
            StrategyAlreadyReachedException.class,
            StrategyNotChangeableException.class,
            StrategyLimitExceededException.class,
            StrategyOrderRejectedException.class
    })
    public ResponseEntity<ErrorResponse> handle(DomainException ex) {
        if (ex instanceof StrategyOrderRejectedException rejected) {
            LOGGER.warn("A strategy order was refused: {}", rejected.getReason());
        }

        HttpStatus status = switch (ex) {
            case StrategyAccessDeniedException ignored -> HttpStatus.FORBIDDEN;
            case StrategyOrderRejectedException ignored -> HttpStatus.FORBIDDEN;
            case StrategyNotFoundException ignored -> HttpStatus.NOT_FOUND;
            case StrategyAlreadyReachedException ignored -> HttpStatus.CONFLICT;
            case StrategyNotChangeableException ignored -> HttpStatus.CONFLICT;
            default -> HttpStatus.UNPROCESSABLE_ENTITY;
        };

        return ResponseEntity.status(status).body(new ErrorResponse(ex.getErrorCode(), ex.getMessage()));
    }
}
