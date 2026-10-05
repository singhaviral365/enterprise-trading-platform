package org.example.trade_executor.client;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Objects;

/**
 * A full quote: the price used for execution plus every field the quote API returned for the
 * symbol (e.g. bid, ask, change, changePercent, previousClose, marketState, asOf, source, stale).
 */
public record QuoteDetails(
        String symbol,
        BigDecimal price,
        Map<String, Object> fields) {

    public QuoteDetails {
        Objects.requireNonNull(symbol, "symbol is required");
        Objects.requireNonNull(price, "price is required");
        fields = fields == null ? Map.of() : fields;
    }
}
