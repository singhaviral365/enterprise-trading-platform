package org.example.trade_executor.strategy.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** One QUOTE from the market-data topic: the price of an instrument, in that instrument's currency, and when it was taken. */
public record StrategyQuote(String symbol, BigDecimal price, OffsetDateTime quotedAt) {
}
