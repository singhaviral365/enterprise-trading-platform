package org.example.trade_executor.executor;

import org.example.trade_executor.client.LiveQuote;
import org.example.backend.entities.Order;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Objects;

@Component
public class FillDecisionEngine {

    public ExecutionOutcome decide(Order order, LiveQuote quote) {
        Objects.requireNonNull(order, "order is required");
        Objects.requireNonNull(quote, "quote is required");

        if (order.getPricingType() == OrderPricingType.MARKET) {
            return ExecutionOutcome.filled(quote.price());
        }

        BigDecimal limitPrice = Objects.requireNonNull(
                order.getPrice(),
                "LIMIT orders require a persisted limit price");

        if (order.getOrderSide() == OrderSide.BUY) {
            return limitPrice.compareTo(quote.price()) >= 0
                    ? ExecutionOutcome.filled(quote.price())
                    : ExecutionOutcome.rejected(ExecutionRejectReason.OUTSIDE_MARKETABLE_RANGE);
        }

        return limitPrice.compareTo(quote.price()) <= 0
                ? ExecutionOutcome.filled(quote.price())
                : ExecutionOutcome.rejected(ExecutionRejectReason.OUTSIDE_MARKETABLE_RANGE);
    }
}

