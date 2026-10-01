package org.example.trade_executor.market;

import java.util.List;

public record MarketBoard(
        List<MarketQuote> quotes,
        String asOf,
        boolean stale) {
}
