package org.example.backend.watchlist.price;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class WatchlistPricingTest {

    private static final Instant NOW = Instant.parse("2026-01-10T10:00:00Z");

    private final WatchlistPricing pricing = new WatchlistPricing(300, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void aRecentQuoteIsLive() {
        Quote quote = new Quote("AAPL", new BigDecimal("189.50"), OffsetDateTime.parse("2026-01-10T09:59:00Z"));

        PriceView view = pricing.viewOf(quote);

        assertEquals(PriceStatus.LIVE, view.status());
        assertEquals(new BigDecimal("189.50"), view.price());
    }

    @Test
    void aQuoteExactlyAtTheThresholdIsStillLive() {
        Quote quote = new Quote("AAPL", BigDecimal.ONE, OffsetDateTime.parse("2026-01-10T09:55:00Z"));

        assertEquals(PriceStatus.LIVE, pricing.viewOf(quote).status());
    }

    @Test
    void anOldQuoteIsStaleButStillCarriesItsPrice() {
        Quote quote = new Quote("AAPL", new BigDecimal("180"), OffsetDateTime.parse("2026-01-10T09:54:59Z"));

        PriceView view = pricing.viewOf(quote);

        assertEquals(PriceStatus.STALE, view.status());
        assertEquals(new BigDecimal("180"), view.price());
    }

    @Test
    void noQuoteMeansUnavailableWithNoPrice() {
        PriceView view = pricing.viewOf(null);

        assertEquals(PriceStatus.UNAVAILABLE, view.status());
        assertNull(view.price());
        assertNull(view.quotedAt());
    }
}
