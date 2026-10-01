package org.example.trade_executor.market;

import java.math.BigDecimal;
import java.util.Map;

public record MarketQuote(
        String symbol,
        String name,
        String assetClass,
        BigDecimal price,
        Map<String, Object> details) {
}
