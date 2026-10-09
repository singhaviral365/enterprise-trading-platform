package org.example.backend.strategy.model;

import org.example.backend.enums.OrderSide;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** What is written when a customer creates a strategy: every column the customer (or the platform's defaults) decides. */
public record NewStrategy(
        long accountId,
        int instrumentId,
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
        int maxFailures) {
}
