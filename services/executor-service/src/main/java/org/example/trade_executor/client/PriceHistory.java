package org.example.trade_executor.client;

import java.math.BigDecimal;
import java.util.List;

/** Daily (or other interval) price candles for one symbol, oldest first, as Fauxnance's /candles returns them. */
public record PriceHistory(String symbol, String currency, String interval, List<Candle> candles) {

    public PriceHistory {
        candles = candles == null ? List.of() : List.copyOf(candles);
    }

    public static PriceHistory empty(String symbol, String interval) {
        return new PriceHistory(symbol, null, interval, List.of());
    }

    /**
     * One candle. {@code date} is an ISO date (yyyy-MM-dd); {@code volume} is null for synthetic candles, which
     * Fauxnance fills in for days the market was closed.
     */
    public record Candle(
            String date,
            BigDecimal open,
            BigDecimal high,
            BigDecimal low,
            BigDecimal close,
            Long volume,
            boolean synthetic) {
    }
}
