package org.example.trade_executor.market;

import java.math.BigDecimal;
import java.util.Map;

/**
 * One instrument with its latest quote. {@code currency} is what {@code price} is quoted in (the quote API's own
 * currency, else the instrument's); {@code iconUrl} is the company logo path stored on the instrument.
 */
public record MarketQuote(
        String symbol,
        String name,
        String assetClass,
        BigDecimal price,
        Map<String, Object> details,
        String currency,
        String iconUrl) {
}
