package org.example.trade_executor.client;

import java.math.BigDecimal;
import java.util.Objects;

public record LiveQuote(
        String symbol,
        BigDecimal price) {

    public LiveQuote {
        Objects.requireNonNull(symbol, "symbol is required");
        Objects.requireNonNull(price, "price is required");

        if (symbol.isBlank()) {
            throw new IllegalArgumentException("symbol cannot be blank");
        }

        if (price.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("price must be positive");
        }
    }
}

