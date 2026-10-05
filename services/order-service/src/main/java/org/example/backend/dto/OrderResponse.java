package org.example.backend.dto;

import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderStatus;

import java.math.BigDecimal;

public record OrderResponse(
        String orderId,
        OrderStatus status,
        String message,
        String symbol,
        OrderSide side,
        OrderPricingType orderPricingType,
        Integer quantity,
        BigDecimal price) {
}
