package org.example.backend.strategy.dto;

import org.example.backend.enums.OrderSide;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.example.backend.strategy.model.TriggerDirection;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record StrategyResponse(
        long strategyId,
        long accountId,
        String symbol,
        String instrumentName,
        String currency,
        OrderSide side,
        long quantity,
        TriggerDirection direction,
        BigDecimal triggerPrice,
        boolean armed,
        OffsetDateTime validFrom,
        OffsetDateTime validUntil,
        BigDecimal maxOrderValue,
        long maxPositionQty,
        int maxExecutions,
        int maxFailures,
        int executions,
        int consecutiveFailures,
        StrategyStatus status,
        String statusReason,
        Long lastOrderId,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime executedAt) {

    public static StrategyResponse from(Strategy strategy) {
        return new StrategyResponse(
                strategy.strategyId(),
                strategy.accountId(),
                strategy.tickerSymbol(),
                strategy.instrumentName(),
                strategy.currency(),
                strategy.side(),
                strategy.quantity(),
                strategy.direction(),
                strategy.triggerPrice(),
                strategy.armed(),
                strategy.validFrom(),
                strategy.validUntil(),
                strategy.maxOrderValue(),
                strategy.maxPositionQty(),
                strategy.maxExecutions(),
                strategy.maxFailures(),
                strategy.executions(),
                strategy.consecutiveFailures(),
                strategy.status(),
                strategy.statusReason(),
                strategy.lastOrderId(),
                strategy.createdAt(),
                strategy.updatedAt(),
                strategy.executedAt());
    }
}
