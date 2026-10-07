package org.example.backend.notifications.consumer;

import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.preferences.model.NotificationCategory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** An order outcome that a strategy placed is filed under its own category, in its own words. */
class StrategyOrderNoticesTest {

    private static final String FILLED = """
            {"eventId":"evt-9","eventType":"ORDER_FILLED","eventTime":"2026-10-07T10:00:00Z","source":"executor-service",
             "schemaVersion":1,"payload":{"orderId":55,"accountId":7,"symbol":"AAPL","side":"BUY","quantity":50,
             "executionPrice":149.8,"reason":null,"occurredAt":"2026-10-07T10:00:00Z"}}""";

    private NotificationGateway gateway;
    private StrategyOrderNotices notices;

    @BeforeEach
    void setUp() {
        gateway = mock(NotificationGateway.class);
        when(gateway.deliver(any())).thenReturn(GatewayResult.RECORDED);
        notices = mock(StrategyOrderNotices.class);
    }

    private NotificationRequest sent() {
        ArgumentCaptor<NotificationRequest> captor = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(gateway).deliver(captor.capture());
        return captor.getValue();
    }

    @Test
    void anOrderAStrategyPlacedGetsTheStrategyCategoryAndWording() {
        when(notices.noticeFor(eq(55L), eq("ORDER_FILLED"), any(), any())).thenReturn(Optional.of(
                new StrategyOrderNotices.Notice("Strategy executed", "Strategy #12 bought 50 AAPL at 149.80.")));

        new TradeEventsConsumer(gateway, notices).handle(FILLED);

        NotificationRequest request = sent();
        assertEquals(NotificationCategory.STRATEGY_EXECUTION, request.category());
        assertEquals("Strategy executed", request.title());
        assertEquals("Strategy #12 bought 50 AAPL at 149.80.", request.message());
        assertEquals("evt-9", request.eventKey(), "still keyed by the event, so a replay is a no-op");
        assertEquals(7, request.accountId());
    }

    @Test
    void anOrderNobodyClaimsKeepsTheOrdinaryCategoryAndWording() {
        when(notices.noticeFor(anyLong(), anyString(), any(), any())).thenReturn(Optional.empty());

        new TradeEventsConsumer(gateway, notices).handle(FILLED);

        NotificationRequest request = sent();
        assertEquals(NotificationCategory.ORDER_STATUS, request.category());
        assertEquals("Order filled", request.title());
        assertEquals("Your buy order for 50 AAPL was filled at 149.80.", request.message());
    }

    @Test
    void theExecutionPriceAndReasonAreHandedOverForTheWording() {
        when(notices.noticeFor(anyLong(), anyString(), any(), any())).thenReturn(Optional.empty());

        new TradeEventsConsumer(gateway, notices).handle(FILLED);

        verify(notices).noticeFor(55L, "ORDER_FILLED", new BigDecimal("149.8"), null);
    }

    @Test
    void withNoNoticeProviderEveryOrderIsOrdinary() {
        new TradeEventsConsumer(gateway).handle(FILLED);

        assertEquals(NotificationCategory.ORDER_STATUS, sent().category());
    }

    @Test
    void aFailureLookingUpTheOriginIsNotSwallowedSoTheEventIsRetriedNotMisfiled() {
        when(notices.noticeFor(anyLong(), anyString(), any(), any())).thenThrow(new IllegalStateException("database down"));

        assertThrows(IllegalStateException.class, () -> new TradeEventsConsumer(gateway, notices).handle(FILLED));

        verify(gateway, never()).deliver(any());
    }

    @Test
    void aPayloadWithNoOrderIdIsNeverAskedAbout() {
        String body = FILLED.replace("\"orderId\":55,", "");

        new TradeEventsConsumer(gateway, notices).handle(body);

        verify(notices, never()).noticeFor(anyLong(), anyString(), any(), any());
        assertEquals(NotificationCategory.ORDER_STATUS, sent().category());
    }
}
