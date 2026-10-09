package org.example.backend.strategy;

import org.example.backend.enums.OrderSide;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.example.backend.strategy.model.TriggerDirection;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Strategies the tests share, with every field named so a test changes only what it is about. */
public final class StrategyFixtures {

    public static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-07T09:00:00Z");

    private StrategyFixtures() {
    }

    /** Strategy 5001 on account 1001: buy 50 AAPL when the price falls to 150 or below. ACTIVE, armed, no runs yet. */
    public static Strategy buyBelow(StrategyStatus status) {
        return new Strategy(
                5001, 1001, 2001, "AAPL", "Apple Inc.", "USD", OrderSide.BUY, 50, TriggerDirection.BELOW,
                new BigDecimal("150.0000"), true, null, null, new BigDecimal("10000.00"), 200, 1, 3, 0, 0, status, null,
                null, 1, T0, T0, null, null);
    }

    public static Strategy withRuns(Strategy base, int executions, int maxExecutions) {
        return new Strategy(
                base.strategyId(), base.accountId(), base.instrumentId(), base.tickerSymbol(), base.instrumentName(),
                base.currency(), base.side(), base.quantity(), base.direction(), base.triggerPrice(), base.armed(),
                base.validFrom(), base.validUntil(), base.maxOrderValue(), base.maxPositionQty(), maxExecutions,
                base.maxFailures(), executions, base.consecutiveFailures(), base.status(), base.statusReason(),
                base.lastOrderId(), base.version(), base.createdAt(), base.updatedAt(), base.executedAt(), base.cancelledAt());
    }

    public static Strategy withWindowEnd(Strategy base, OffsetDateTime validUntil) {
        return new Strategy(
                base.strategyId(), base.accountId(), base.instrumentId(), base.tickerSymbol(), base.instrumentName(),
                base.currency(), base.side(), base.quantity(), base.direction(), base.triggerPrice(), base.armed(),
                base.validFrom(), validUntil, base.maxOrderValue(), base.maxPositionQty(), base.maxExecutions(),
                base.maxFailures(), base.executions(), base.consecutiveFailures(), base.status(), base.statusReason(),
                base.lastOrderId(), base.version(), base.createdAt(), base.updatedAt(), base.executedAt(), base.cancelledAt());
    }
}
