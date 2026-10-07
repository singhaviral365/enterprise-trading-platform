package org.example.backend.watchlist.consumer;

import org.example.backend.watchlist.alert.PriceAlertEvaluator;
import org.example.backend.watchlist.price.LatestQuoteStore;
import org.example.backend.watchlist.price.Quote;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/** The consumer now also asks the alert evaluator about each quote that moved a price forward. */
class MarketDataQuoteConsumerAlertsTest {

    private final LatestQuoteStore store = new LatestQuoteStore(100);
    private PriceAlertEvaluator evaluator;
    private MarketDataQuoteConsumer consumer;

    @BeforeEach
    void setUp() {
        evaluator = mock(PriceAlertEvaluator.class);
        consumer = new MarketDataQuoteConsumer(store, evaluator);
    }

    private static String quote(String price, String quotedAt) {
        return """
                {"eventId":"e1","eventType":"QUOTE","eventTime":"2026-01-10T10:00:01Z","source":"executor-service",
                 "schemaVersion":1,"payload":{"symbol":"AAPL","price":%s,"quotedAt":"%s"}}
                """.formatted(price, quotedAt);
    }

    @Test
    void aNewerQuoteIsEvaluatedAgainstTheAlerts() {
        Quote stored = consumer.handle(quote("201.25", "2026-01-10T10:00:00Z"));

        assertNotNull(stored);
        verify(evaluator).evaluate(stored);
    }

    @Test
    void aReplayedOrOlderQuoteCannotFireAnythingBecauseItIsNeverEvaluated() {
        consumer.handle(quote("201.25", "2026-01-10T10:00:00Z"));

        assertNull(consumer.handle(quote("201.25", "2026-01-10T10:00:00Z")));
        assertNull(consumer.handle(quote("250.00", "2026-01-10T09:00:00Z")));

        verify(evaluator, org.mockito.Mockito.times(1)).evaluate(any());
    }

    @Test
    void aFailureEvaluatingAlertsNeverLosesThePriceOrDeadLettersTheQuote() {
        doThrow(new IllegalStateException("database down")).when(evaluator).evaluate(any());

        Quote stored = consumer.handle(quote("201.25", "2026-01-10T10:00:00Z"));

        assertNotNull(stored);
        assertEquals(new BigDecimal("201.25"), store.latest("AAPL").orElseThrow().price());
    }

    @Test
    void withoutAnEvaluatorTheConsumerStillKeepsPrices() {
        MarketDataQuoteConsumer pricesOnly = new MarketDataQuoteConsumer(store);

        assertNotNull(pricesOnly.handle(quote("201.25", "2026-01-10T10:00:00Z")));
        verify(evaluator, never()).evaluate(any());
    }
}
