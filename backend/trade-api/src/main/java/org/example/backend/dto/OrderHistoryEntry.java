package org.example.backend.dto;

import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record OrderHistoryEntry(
        String orderId,
        Long accountId,
        String symbol,
        OrderSide side,
        OrderPricingType orderPricingType,
        Integer quantity,
        BigDecimal price,
        BigDecimal executedPrice,
        OrderStatus status,
        String idempotencyKey,
        OffsetDateTime createdOn) {
}
