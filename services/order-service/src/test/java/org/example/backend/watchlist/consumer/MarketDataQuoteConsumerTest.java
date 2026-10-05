package org.example.backend.watchlist.consumer;

import org.example.backend.watchlist.exceptions.PoisonQuoteMessageException;
import org.example.backend.watchlist.price.LatestQuoteStore;
import org.example.backend.watchlist.price.Quote;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.kafka.annotation.KafkaListener;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MarketDataQuoteConsumerTest {

    private final LatestQuoteStore store = new LatestQuoteStore(100);
    private final MarketDataQuoteConsumer consumer = new MarketDataQuoteConsumer(store);

    /** The envelope exactly as the executor-service's poller publishes it. */
    private static String quote(String symbol, String price, String quotedAt) {
        return """
                {"eventId":"e1","eventType":"QUOTE","eventTime":"2026-01-10T10:00:01Z",
                 "source":"executor-service","schemaVersion":1,
                 "payload":{"symbol":"%s","price":%s,"quotedAt":"%s"}}
                """.formatted(symbol, price, quotedAt);
    }

    @Test
    void aQuoteMessageUpdatesTheLatestPrice() {
        Quote stored = consumer.handle(quote("AAPL", "189.5", "2026-01-10T10:00:00Z"));

        assertNotNull(stored);
        assertEquals(new BigDecimal("189.5"), store.latest("AAPL").orElseThrow().price());
        assertEquals(OffsetDateTime.parse("2026-01-10T10:00:00Z"), store.latest("AAPL").orElseThrow().quotedAt());
    }

    @Test
    void aNewerQuoteReplacesAndAnOlderOneDoesNot() {
        consumer.handle(quote("AAPL", "190", "2026-01-10T10:01:00Z"));

        assertNull(consumer.handle(quote("AAPL", "180", "2026-01-10T10:00:00Z")));

        assertEquals(new BigDecimal("190"), store.latest("AAPL").orElseThrow().price());
    }

    @Test
    void aReplayedMessageChangesNothing() {
        String message = quote("AAPL", "190", "2026-01-10T10:00:00Z");
        consumer.handle(message);

        assertNull(consumer.handle(message));
        assertEquals(1, store.size());
    }

    @Test
    void otherEventTypesAreIgnored() {
        Quote stored = consumer.handle("""
                {"eventType":"ORDER_FILLED","payload":{"symbol":"AAPL","price":1,"quotedAt":"2026-01-10T10:00:00Z"}}
                """);

        assertNull(stored);
        assertEquals(0, store.size());
    }

    @Test
    void quotedAtFallsBackToTheEnvelopeEventTime() {
        consumer.handle("""
                {"eventType":"QUOTE","eventTime":"2026-01-10T10:00:01Z",
                 "payload":{"symbol":"AAPL","price":5}}
                """);

        assertEquals(OffsetDateTime.parse("2026-01-10T10:00:01Z"), store.latest("AAPL").orElseThrow().quotedAt());
    }

    @Test
    void anUnknownExtraFieldOnThePayloadIsIgnored() {
        Quote stored = consumer.handle("""
                {"eventType":"QUOTE","schemaVersion":2,
                 "payload":{"symbol":"AAPL","price":5,"quotedAt":"2026-01-10T10:00:00Z","currency":"USD"}}
                """);

        assertNotNull(stored);
    }

    @Test
    void malformedMessagesAreRejectedAsPoison() {
        for (String bad : new String[] {
                "not json at all",
                "[1,2,3]",
                "{\"eventType\":\"QUOTE\"}",
                "{\"eventType\":\"QUOTE\",\"payload\":{\"price\":1,\"quotedAt\":\"2026-01-10T10:00:00Z\"}}",
                "{\"eventType\":\"QUOTE\",\"payload\":{\"symbol\":\"AAPL\",\"quotedAt\":\"2026-01-10T10:00:00Z\"}}",
                "{\"eventType\":\"QUOTE\",\"payload\":{\"symbol\":\"AAPL\",\"price\":\"abc\",\"quotedAt\":\"2026-01-10T10:00:00Z\"}}",
                "{\"eventType\":\"QUOTE\",\"payload\":{\"symbol\":\"AAPL\",\"price\":0,\"quotedAt\":\"2026-01-10T10:00:00Z\"}}",
                "{\"eventType\":\"QUOTE\",\"payload\":{\"symbol\":\"AAPL\",\"price\":-3,\"quotedAt\":\"2026-01-10T10:00:00Z\"}}",
                "{\"eventType\":\"QUOTE\",\"payload\":{\"symbol\":\"AAPL\",\"price\":1,\"quotedAt\":\"yesterday\"}}",
                "{\"eventType\":\"QUOTE\",\"payload\":{\"symbol\":\"AAPL\",\"price\":1}}"
        }) {
            assertThrows(PoisonQuoteMessageException.class, () -> consumer.handle(bad), bad);
        }

        assertEquals(0, store.size());
    }

    @Test
    void listensToMarketDataOnlyInItsOwnGroup() throws NoSuchMethodException {
        Method listener = MarketDataQuoteConsumer.class.getMethod("onMessage", String.class);
        KafkaListener annotation = listener.getAnnotation(KafkaListener.class);
        StandardEnvironment environment = new StandardEnvironment();

        // Exactly one topic, and it is market-data: never orders or trade-events.
        assertEquals(1, annotation.topics().length);
        assertEquals("market-data", environment.resolveRequiredPlaceholders(annotation.topics()[0]));

        // The group is the module's own, and is not the executor-service's.
        String group = environment.resolveRequiredPlaceholders(annotation.groupId());
        assertEquals("watchlist-prices", group);
        assertNotEquals("executor-service", group);
    }
}
