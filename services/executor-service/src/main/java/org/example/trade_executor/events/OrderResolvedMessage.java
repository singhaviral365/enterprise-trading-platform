package org.example.trade_executor.events;

import org.example.backend.enums.OrderSide;

import java.math.BigDecimal;

public record OrderResolvedMessage(
        long orderId,
        int accountId,
        String symbol,
        OrderSide side,
        long quantity,
        BigDecimal executionPrice,
        String reason,
    String occurredAt) {

    public static OrderResolvedMessage from(OrderResolvedEvent event) {
        return new OrderResolvedMessage(
                event.orderId(),
                event.accountId(),
                event.symbol(),
                event.side(),
                event.quantity(),
                event.executionPrice(),
                event.rejectReason() == null ? null : event.rejectReason().name(),
                event.occurredAt() == null ? null : event.occurredAt().toString());
    }
}

