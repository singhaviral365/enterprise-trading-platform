package org.example.trade_executor.marketdata;

import org.example.trade_executor.client.LiveQuote;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record MarketDataQuoteMessage(
        String symbol,
        BigDecimal price,
        String quotedAt) {

    public static MarketDataQuoteMessage from(LiveQuote quote, OffsetDateTime quotedAt) {
        return new MarketDataQuoteMessage(
                quote.symbol(),
                quote.price(),
                quotedAt.toString());
    }
}