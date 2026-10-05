package org.example.trade_executor.events;

import org.example.backend.enums.OrderSide;
import org.example.trade_executor.executor.ExecutionRejectReason;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record OrderResolvedEvent(
        String eventType,
        long orderId,
        int accountId,
        String symbol,
        OrderSide side,
        long quantity,
        BigDecimal executionPrice,
        ExecutionRejectReason rejectReason,
        OffsetDateTime occurredAt) {
}

