package org.example.backend.notifications.consumer;

import org.example.backend.notifications.exceptions.PoisonTradeEventException;
import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.preferences.model.NotificationCategory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.kafka.annotation.KafkaListener;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class TradeEventsConsumerTest {

    private NotificationGateway gateway;
    private TradeEventsConsumer consumer;

    @BeforeEach
    void setUp() {
        gateway = mock(NotificationGateway.class);
        when(gateway.deliver(any())).thenReturn(GatewayResult.RECORDED);
        consumer = new TradeEventsConsumer(gateway);
    }

    /** The envelope exactly as the executor-service's TradeEventProducer publishes it. */
    private static String event(String eventId, String type, String payload) {
        return """
                {"eventId":"%s","eventType":"%s","eventTime":"2026-10-06T10:00:00Z",
                 "source":"executor-service","schemaVersion":1,"payload":%s}
                """.formatted(eventId, type, payload);
    }

    private static final String FILLED_BODY = """
            {"orderId":55,"accountId":7,"symbol":"AAPL","side":"BUY","quantity":10,
             "executionPrice":189.5,"reason":null,"occurredAt":"2026-10-06T10:00:00Z"}""";

    private NotificationRequest sent() {
        ArgumentCaptor<NotificationRequest> captor = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(gateway).deliver(captor.capture());
        return captor.getValue();
    }

    @Test
    void aFilledOrderProducesANotificationKeyedByTheEventId() {
        consumer.handle(event("evt-1", "ORDER_FILLED", FILLED_BODY));

        NotificationRequest request = sent();
        assertEquals(7, request.accountId());
        assertEquals(NotificationCategory.ORDER_STATUS, request.category());
        assertEquals("evt-1", request.eventKey());
        assertEquals("Order filled", request.title());
        assertEquals("Your buy order for 10 AAPL was filled at 189.50.", request.message());
    }

    @Test
    void aRejectedOrderIsJustAsNewsworthyAndSaysWhy() {
        consumer.handle(event("evt-2", "ORDER_REJECTED", """
                {"orderId":56,"accountId":7,"symbol":"TSLA","side":"SELL","quantity":3,
                 "executionPrice":null,"reason":"INSUFFICIENT_HOLDINGS","occurredAt":"2026-10-06T10:00:00Z"}"""));

        NotificationRequest request = sent();
        assertEquals("Order rejected", request.title());
        assertEquals("Your sell order for 3 TSLA was rejected: you did not hold enough shares.", request.message());
    }

    @Test
    void aReasonThePlatformDoesNotKnowIsNotEchoedBack() {
        consumer.handle(event("evt-3", "ORDER_REJECTED", """
                {"orderId":57,"accountId":7,"symbol":"TSLA","side":"BUY","quantity":3,
                 "reason":"<script>alert(1)</script>","occurredAt":"2026-10-06T10:00:00Z"}"""));

        assertEquals("Your buy order for 3 TSLA was rejected: it could not be executed.", sent().message());
    }

    @Test
    void aCancelledOrderProducesANotification() {
        consumer.handle(event("evt-4", "ORDER_CANCELLED", """
                {"orderId":58,"accountId":7,"symbol":"MSFT","side":"BUY","quantity":1,"occurredAt":"2026-10-06T10:00:00Z"}"""));

        assertEquals("Order cancelled", sent().title());
    }

    @Test
    void aReplayedEventIsHandedToTheGatewayWhichRecognisesItAndSendsNothing() {
        when(gateway.deliver(any())).thenReturn(GatewayResult.RECORDED, GatewayResult.DUPLICATE);

        GatewayResult first = consumer.handle(event("evt-1", "ORDER_FILLED", FILLED_BODY));
        GatewayResult second = consumer.handle(event("evt-1", "ORDER_FILLED", FILLED_BODY));

        assertEquals(GatewayResult.RECORDED, first);
        assertEquals(GatewayResult.DUPLICATE, second);
    }

    @Test
    void anEventThatIsNotAnOrderOutcomeIsIgnored() {
        assertNull(consumer.handle(event("evt-5", "ORDER_PLACED", FILLED_BODY)));

        verifyNoInteractions(gateway);
    }

    @Test
    void aMalformedMessageIsPoisonSoItIsDeadLetteredAtOnce() {
        assertThrows(PoisonTradeEventException.class, () -> consumer.handle("not json"));
        assertThrows(PoisonTradeEventException.class, () -> consumer.handle("[]"));
        assertThrows(PoisonTradeEventException.class, () -> consumer.handle(event("", "ORDER_FILLED", FILLED_BODY)));
        assertThrows(PoisonTradeEventException.class,
                () -> consumer.handle("{\"eventId\":\"x\",\"eventType\":\"ORDER_FILLED\"}"));
        assertThrows(PoisonTradeEventException.class,
                () -> consumer.handle(event("evt-6", "ORDER_FILLED", "{\"accountId\":0,\"symbol\":\"A\",\"quantity\":1}")));
        assertThrows(PoisonTradeEventException.class,
                () -> consumer.handle(event("evt-7", "ORDER_FILLED", "{\"accountId\":7,\"quantity\":1}")));

        verify(gateway, never()).deliver(any());
    }

    @Test
    void aRequestTheGatewayRefusesOnValidationIsPoisonNotRetried() {
        doThrow(new IllegalArgumentException("Title cannot exceed 120 characters")).when(gateway).deliver(any());

        assertThrows(PoisonTradeEventException.class, () -> consumer.handle(event("evt-8", "ORDER_FILLED", FILLED_BODY)));
    }

    @Test
    void aFailureToRecordIsNotSwallowedSoTheOffsetIsNotCommitted() {
        doThrow(new IllegalStateException("database down")).when(gateway).deliver(any());

        assertThrows(IllegalStateException.class, () -> consumer.handle(event("evt-9", "ORDER_FILLED", FILLED_BODY)));
    }

    @Test
    void theListenerUsesItsOwnGroupAndOnlyTheTradeEventsTopic() throws NoSuchMethodException {
        Method method = TradeEventsConsumer.class.getMethod("onMessage", String.class);
        KafkaListener listener = method.getAnnotation(KafkaListener.class);
        StandardEnvironment environment = new StandardEnvironment();

        assertEquals("trade-events", environment.resolvePlaceholders(listener.topics()[0]));
        assertEquals("customer-notifications", environment.resolvePlaceholders(listener.groupId()));
        assertEquals("notificationsKafkaListenerContainerFactory", listener.containerFactory());
        assertFalse(listener.groupId().contains("executor"));
        assertTrue(environment.resolvePlaceholders(listener.topics()[0]).equals("trade-events"));
    }
}
