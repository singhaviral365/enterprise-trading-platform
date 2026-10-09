package org.example.backend.strategy.model;

import org.example.backend.enums.OrderSide;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * A {@code strategy} row, with the ticker, name and currency of its instrument alongside. The {@code armed} flag and
 * the counters are the executor's to move; the customer's routes only read them.
 */
public record Strategy(
        long strategyId,
        long accountId,
        int instrumentId,
        String tickerSymbol,
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
        long version,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime executedAt,
        OffsetDateTime cancelledAt) {

    /** The idempotency key of the order this strategy places next. Stays the same until a run succeeds. */
    public String nextOrderKey() {
        return orderKey(strategyId, executions + 1);
    }

    public static String orderKey(long strategyId, int runNumber) {
        return ORDER_KEY_PREFIX + strategyId + "-" + runNumber;
    }

    public static final String ORDER_KEY_PREFIX = "strat-";
}
