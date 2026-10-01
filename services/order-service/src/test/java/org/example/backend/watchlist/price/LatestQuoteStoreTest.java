package org.example.backend.watchlist.price;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LatestQuoteStoreTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-10T10:00:00Z");

    @Test
    void keepsTheLatestQuotePerSymbol() {
        LatestQuoteStore store = new LatestQuoteStore(10);

        assertTrue(store.offer(new Quote("AAPL", new BigDecimal("100"), T0)));
        assertTrue(store.offer(new Quote("AAPL", new BigDecimal("101"), T0.plusMinutes(1))));

        assertEquals(new BigDecimal("101"), store.latest("AAPL").orElseThrow().price());
        assertEquals(1, store.size());
    }

    @Test
    void ignoresAQuoteOlderThanTheOneHeld() {
        LatestQuoteStore store = new LatestQuoteStore(10);
        store.offer(new Quote("AAPL", new BigDecimal("101"), T0.plusMinutes(1)));

        assertFalse(store.offer(new Quote("AAPL", new BigDecimal("99"), T0)));

        assertEquals(new BigDecimal("101"), store.latest("AAPL").orElseThrow().price());
    }

    @Test
    void ignoresAReplayedQuote() {
        LatestQuoteStore store = new LatestQuoteStore(10);
        Quote quote = new Quote("AAPL", new BigDecimal("101"), T0);
        store.offer(quote);

        assertFalse(store.offer(quote));
    }

    @Test
    void symbolLookupIgnoresCase() {
        LatestQuoteStore store = new LatestQuoteStore(10);
        store.offer(new Quote("infy.ns", new BigDecimal("1500"), T0));

        assertTrue(store.latest("INFY.NS").isPresent());
    }

    @Test
    void asAQuoteSourceItReturnsOnlyTheSymbolsItHoldsKeyedUpperCase() {
        LatestQuoteStore store = new LatestQuoteStore(10);
        store.offer(new Quote("aapl", new BigDecimal("189.5"), T0));

        Map<String, Quote> found = store.latest(List.of("AAPL", "TSLA"));

        assertEquals(1, found.size());
        assertEquals(new BigDecimal("189.5"), found.get("AAPL").price());
    }

    @Test
    void doesNotGrowPastItsBound() {
        LatestQuoteStore store = new LatestQuoteStore(2);
        store.offer(new Quote("A", BigDecimal.ONE, T0));
        store.offer(new Quote("B", BigDecimal.ONE, T0));

        assertFalse(store.offer(new Quote("C", BigDecimal.ONE, T0)));

        assertEquals(2, store.size());
        assertTrue(store.latest("C").isEmpty());
        // Existing symbols still update when full.
        assertTrue(store.offer(new Quote("A", BigDecimal.TEN, T0.plusMinutes(1))));
    }
}
