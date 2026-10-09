package org.example.backend.portfolio.model;

import org.example.backend.enums.OrderSide;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One filled order, read from {@code orders}. {@code price} is the fill price (the executor overwrites the order's price
 * when it fills) and is in the account's currency, like every stored price on the platform.
 */
public record FilledOrder(
        long orderId,
        String tickerSymbol,
        OrderSide side,
        long quantity,
        BigDecimal price,
        OffsetDateTime transactionDate) {
}
