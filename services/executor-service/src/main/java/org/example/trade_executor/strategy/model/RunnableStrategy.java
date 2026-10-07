package org.example.trade_executor.strategy.model;

import org.example.backend.enums.OrderSide;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * An ACTIVE strategy as the worker reads it for one quote: the rule, its limits, its counters, and who owns it. The
 * order-service owns the table and the customer's routes; the worker only ever reads this and moves it through a run.
 */
public record RunnableStrategy(
        long strategyId,
        int accountId,
        long ownerUserId,
        int instrumentId,
        String tickerSymbol,
        String instrumentCurrency,
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
        int consecutiveFailures) {

    public static final String ORDER_KEY_PREFIX = "strat-";

    /** The run this attempt is for: the next one after those that already succeeded. A retry keeps the same number. */
    public int runNumber() {
        return executions + 1;
    }

    /**
     * The idempotency key of this run's order. It stays the same across retries of the run, so a retry after a timeout
     * (when the first attempt may well have been placed) cannot place a second order.
     */
    public String orderKey() {
        return ORDER_KEY_PREFIX + strategyId + "-" + runNumber();
    }
}
