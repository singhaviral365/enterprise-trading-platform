package org.example.backend.watchlist.alert;

import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.AlertDelivery;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.TriggeredAlert;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PriceAlertRedeliveryTest {

    private static final Instant NOW = Instant.parse("2026-10-06T10:00:00Z");
    private static final OffsetDateTime FIRED = OffsetDateTime.parse("2026-10-06T09:00:00Z");

    private WatchlistMapper mapper;
    private NotificationGateway gateway;
    private PriceAlertRedelivery redelivery;

    @BeforeEach
    void setUp() {
        mapper = mock(WatchlistMapper.class);
        gateway = mock(NotificationGateway.class);
        PriceAlertFiring firing = new PriceAlertFiring(mapper, new PriceAlertIndex(), gateway, Clock.fixed(NOW, ZoneOffset.UTC));
        redelivery = new PriceAlertRedelivery(mapper, firing, 3, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static TriggeredAlert alert(int attempts) {
        return new TriggeredAlert(9, 7, "AAPL", AlertDirection.ABOVE, new BigDecimal("200"), new BigDecimal("201"), FIRED, attempts);
    }

    @Test
    void anAlertWhoseHandOverFailedIsHandedOverAgain() {
        when(mapper.selectUndeliveredAlerts(anyInt(), any(), anyInt())).thenReturn(List.of(alert(1)));
        when(mapper.selectTriggeredAlert(9, "AAPL")).thenReturn(Optional.of(alert(1)));
        when(gateway.deliver(any())).thenReturn(GatewayResult.RECORDED);

        assertEquals(1, redelivery.retry());

        verify(gateway).deliver(any());
        verify(mapper).recordAlertDelivery(9, "AAPL", AlertDelivery.HANDED_OVER);
    }

    @Test
    void aRepeatedHandOverOfTheSameAlertIsADuplicateTheGatewayRecognises() {
        when(mapper.selectUndeliveredAlerts(anyInt(), any(), anyInt())).thenReturn(List.of(alert(0)));
        when(mapper.selectTriggeredAlert(9, "AAPL")).thenReturn(Optional.of(alert(0)));
        when(gateway.deliver(any())).thenReturn(GatewayResult.DUPLICATE);

        redelivery.retry();

        verify(mapper).recordAlertDelivery(9, "AAPL", AlertDelivery.HANDED_OVER);
    }

    @Test
    void theQueryIsBoundedByAttemptsAndLeavesAJustFiredAlertAlone() {
        when(mapper.selectUndeliveredAlerts(anyInt(), any(), anyInt())).thenReturn(List.of());

        assertEquals(0, redelivery.retry());

        verify(mapper).selectUndeliveredAlerts(eq(3), eq(OffsetDateTime.parse("2026-10-06T09:59:55Z")), eq(50));
    }

    @Test
    void aFailureOfTheSweepItselfNeverEscapesTheScheduler() {
        when(mapper.selectUndeliveredAlerts(anyInt(), any(), anyInt())).thenThrow(new IllegalStateException("database down"));

        assertDoesNotThrow(redelivery::retryUndelivered);
    }
}
