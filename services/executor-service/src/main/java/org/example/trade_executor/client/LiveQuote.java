package org.example.trade_executor.client;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * A live price for one symbol. {@code currency} is the ISO 4217 code the price is quoted in, as reported by
 * the quote API; it is null when the API did not say (callers then fall back to the instrument's own currency).
 */
public record LiveQuote(
        String symbol,
        BigDecimal price,
        String currency) {

    public LiveQuote {
        Objects.requireNonNull(symbol, "symbol is required");
        Objects.requireNonNull(price, "price is required");

        if (symbol.isBlank()) {
            throw new IllegalArgumentException("symbol cannot be blank");
        }

        if (price.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("price must be positive");
        }

        currency = currency == null || currency.isBlank() ? null : currency.trim().toUpperCase();
    }

    public LiveQuote(String symbol, BigDecimal price) {
        this(symbol, price, null);
    }

    /** The same quote expressed in another currency. */
    public LiveQuote withPrice(BigDecimal newPrice, String newCurrency) {
        return new LiveQuote(symbol, newPrice, newCurrency);
    }
}
