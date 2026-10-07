package org.example.trade_executor.strategy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.trade_executor.strategy.model.StrategyQuote;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class StrategyQuoteConsumerTest {

    /** The envelope exactly as the executor's MarketDataEventProducer publishes it. */
    private static String quote(String eventType, String payload) {
        return """
                {"eventId":"e-1","eventType":"%s","eventTime":"2026-10-07T10:00:05Z","source":"executor-service",
                 "schemaVersion":1,"payload":%s}""".formatted(eventType, payload);
    }

    private static final String AAPL = "{\"symbol\":\"AAPL\",\"price\":149.8,\"quotedAt\":\"2026-10-07T10:00:00Z\"}";

    private StrategyWorker worker;
    private Acknowledgment ack;
    private StrategyQuoteConsumer consumer;

    @BeforeEach
    void setUp() {
        worker = mock(StrategyWorker.class);
        ack = mock(Acknowledgment.class);
        consumer = new StrategyQuoteConsumer(new ObjectMapper(), worker);
    }

    @Test
    void aQuoteIsHandedToTheWorkerAndOnlyThenAcknowledged() {
        consumer.onMessage(quote("QUOTE", AAPL), ack);

        ArgumentCaptor<StrategyQuote> handed = ArgumentCaptor.forClass(StrategyQuote.class);
        var order = inOrder(worker, ack);
        order.verify(worker).onQuote(handed.capture());
        order.verify(ack).acknowledge();
        assertEquals("AAPL", handed.getValue().symbol());
        assertEquals(new BigDecimal("149.8"), handed.getValue().price());
        assertEquals(OffsetDateTime.parse("2026-10-07T10:00:00Z"), handed.getValue().quotedAt());
    }

    @Test
    void aFailureInTheWorkerLeavesTheMessageUnacknowledgedSoItIsDeliveredAgain() {
        doThrow(new IllegalStateException("database down")).when(worker).onQuote(any());

        assertThrows(IllegalStateException.class, () -> consumer.onMessage(quote("QUOTE", AAPL), ack));

        verify(ack, never()).acknowledge();
    }

    @Test
    void theSymbolIsUpperCasedSoItMatchesTheInstrumentTable() {
        StrategyQuote parsed = consumer.parse(quote("QUOTE", AAPL.replace("AAPL", " aapl ")));

        assertEquals("AAPL", parsed.symbol());
    }

    @Test
    void anEventThatIsNotAQuoteIsAcknowledgedAndIgnored() {
        consumer.onMessage(quote("HEARTBEAT", "{}"), ack);

        verify(worker, never()).onQuote(any());
        verify(ack).acknowledge();
        assertNull(consumer.parse(quote("HEARTBEAT", "{}")));
    }

    @Test
    void whenQuotedAtIsMissingTheEventTimeIsUsed() {
        StrategyQuote parsed = consumer.parse(quote("QUOTE", "{\"symbol\":\"AAPL\",\"price\":1}"));

        assertEquals(OffsetDateTime.parse("2026-10-07T10:00:05Z"), parsed.quotedAt());
    }

    @Test
    void aMalformedMessageCanNeverBeProcessedAndIsNotRetried() {
        for (String bad : new String[] {
                "not json",
                "[]",
                quote("QUOTE", "null"),
                quote("QUOTE", "{\"price\":1,\"quotedAt\":\"2026-10-07T10:00:00Z\"}"),
                quote("QUOTE", "{\"symbol\":\"\",\"price\":1,\"quotedAt\":\"2026-10-07T10:00:00Z\"}"),
                quote("QUOTE", "{\"symbol\":\"AAPL\",\"quotedAt\":\"2026-10-07T10:00:00Z\"}"),
                quote("QUOTE", "{\"symbol\":\"AAPL\",\"price\":0,\"quotedAt\":\"2026-10-07T10:00:00Z\"}"),
                quote("QUOTE", "{\"symbol\":\"AAPL\",\"price\":-3,\"quotedAt\":\"2026-10-07T10:00:00Z\"}"),
                quote("QUOTE", "{\"symbol\":\"AAPL\",\"price\":\"149\",\"quotedAt\":\"2026-10-07T10:00:00Z\"}"),
                quote("QUOTE", "{\"symbol\":\"AAPL\",\"price\":1,\"quotedAt\":\"yesterday\"}"),
        }) {
            assertThrows(PoisonStrategyQuoteException.class, () -> consumer.parse(bad), bad);
        }
    }

    @Test
    void itListensToMarketDataInAGroupOfItsOwnWithManualAcknowledgement() throws Exception {
        Method listener = StrategyQuoteConsumer.class.getMethod("onMessage", String.class, Acknowledgment.class);
        KafkaListener annotation = listener.getAnnotation(KafkaListener.class);

        assertEquals("${trading.kafka.market-data-topic:market-data}", annotation.topics()[0]);
        assertEquals("${strategy.kafka.consumer-group:strategy-worker}", annotation.groupId());
        assertEquals("strategyKafkaListenerContainerFactory", annotation.containerFactory());
    }
}
