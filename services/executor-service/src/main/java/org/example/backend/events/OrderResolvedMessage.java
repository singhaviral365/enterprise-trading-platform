package org.example.backend.events;

import org.example.backend.enums.OrderSide;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record OrderResolvedMessage(
        long orderId,
        int accountId,
        String symbol,
        OrderSide side,
        long quantity,
        BigDecimal executionPrice,
        String reason,
        OffsetDateTime occurredAt) {
}

