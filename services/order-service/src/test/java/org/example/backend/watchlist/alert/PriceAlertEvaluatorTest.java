package org.example.backend.watchlist.alert;

import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.AlertDelivery;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.AlertWatch;
import org.example.backend.watchlist.model.TriggeredAlert;
import org.example.backend.watchlist.price.Quote;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The execution paths of the alert story: crossing fires, falling short does not, and it goes through notifications. */
class PriceAlertEvaluatorTest {

    private static final Instant NOW = Instant.parse("2026-10-06T10:00:00Z");
    private static final OffsetDateTime FIRED = OffsetDateTime.parse("2026-10-06T10:00:00Z");

    private WatchlistMapper mapper;
    private NotificationGateway gateway;
    private PriceAlertIndex index;
    private PriceAlertEvaluator evaluator;

    @BeforeEach
    void setUp() {
        mapper = mock(WatchlistMapper.class);
        gateway = mock(NotificationGateway.class);
        index = new PriceAlertIndex();
        PriceAlertFiring firing = new PriceAlertFiring(mapper, index, gateway, Clock.fixed(NOW, ZoneOffset.UTC));
        evaluator = new PriceAlertEvaluator(index, firing);
    }

    private static Quote quote(String symbol, String price) {
        return new Quote(symbol, new BigDecimal(price), FIRED);
    }

    private AlertWatch armed(AlertDirection direction, String target) {
        AlertWatch watch = new AlertWatch(9, "AAPL", direction, new BigDecimal(target));
        index.put(watch);
        return watch;
    }

    /** The database fires the alert, and reads it back with the account when it is handed over. */
    private void databaseFires(AlertDirection direction, String target, String triggerPrice) {
        when(mapper.markTriggered(eq(9L), eq("AAPL"), eq(direction), eq(new BigDecimal(target)), eq(new BigDecimal(triggerPrice)), any()))
                .thenReturn(1);
        when(mapper.selectTriggeredAlert(9, "AAPL")).thenReturn(Optional.of(new TriggeredAlert(
                9, 7, "AAPL", direction, new BigDecimal(target), new BigDecimal(triggerPrice), FIRED, 0)));
        when(gateway.deliver(any())).thenReturn(GatewayResult.RECORDED);
    }

    @Test
    void aQuoteCrossingTheThresholdTriggersTheAlert() {
        armed(AlertDirection.ABOVE, "200.00");
        databaseFires(AlertDirection.ABOVE, "200.00", "201.25");

        assertEquals(1, evaluator.evaluate(quote("AAPL", "201.25")));

        verify(mapper).markTriggered(eq(9L), eq("AAPL"), eq(AlertDirection.ABOVE), eq(new BigDecimal("200.00")),
                eq(new BigDecimal("201.25")), eq(FIRED));
    }

    @Test
    void aQuoteShortOfTheThresholdDoesNotTriggerIt() {
        armed(AlertDirection.ABOVE, "200.00");
        index.put(new AlertWatch(10, "AAPL", AlertDirection.BELOW, new BigDecimal("150.00")));

        assertEquals(0, evaluator.evaluate(quote("AAPL", "199.99")));
        assertEquals(0, evaluator.evaluate(quote("AAPL", "150.01")));

        verifyNoInteractions(mapper, gateway);
        assertEquals(2, index.candidates("AAPL").size(), "both alerts stay armed");
    }

    @Test
    void reachingTheTargetExactlyCountsInBothDirections() {
        assertTrue(AlertDirection.ABOVE.reachedBy(new BigDecimal("200.00"), new BigDecimal("200")));
        assertTrue(AlertDirection.BELOW.reachedBy(new BigDecimal("150"), new BigDecimal("150.00")));
        assertFalse(AlertDirection.ABOVE.reachedBy(new BigDecimal("199.9999"), new BigDecimal("200")));
        assertFalse(AlertDirection.BELOW.reachedBy(new BigDecimal("150.0001"), new BigDecimal("150")));
    }

    @Test
    void aBelowAlertFiresWhenThePriceFallsToIt() {
        armed(AlertDirection.BELOW, "150.00");
        databaseFires(AlertDirection.BELOW, "150.00", "149.50");

        assertEquals(1, evaluator.evaluate(quote("AAPL", "149.50")));
    }

    @Test
    void theAlertIsDeliveredThroughNotificationsNotToALog() {
        armed(AlertDirection.ABOVE, "200.00");
        databaseFires(AlertDirection.ABOVE, "200.00", "201.25");

        evaluator.evaluate(quote("AAPL", "201.25"));

        ArgumentCaptor<NotificationRequest> request = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(gateway).deliver(request.capture());
        assertEquals(7, request.getValue().accountId());
        assertEquals(NotificationCategory.WATCHLIST_ALERTS, request.getValue().category());
        assertEquals("Price alert: AAPL", request.getValue().title());
        assertEquals("AAPL rose to 201.25, at or above your target of 200.00.", request.getValue().message());
        assertEquals("price-alert:9:AAPL:" + FIRED.toInstant().toEpochMilli(), request.getValue().eventKey());
        verify(mapper).recordAlertDelivery(9, "AAPL", AlertDelivery.HANDED_OVER);
    }

    @Test
    void thisModuleNeverChoosesAChannel() {
        // The request type has no channel, address or URL at all: the caller cannot say where a message goes.
        var components = NotificationRequest.class.getRecordComponents();
        for (var component : components) {
            String name = component.getName().toLowerCase();
            assertFalse(name.contains("channel") || name.contains("address") || name.contains("url") || name.contains("email"), name);
        }
    }

    @Test
    void anAlertFiresOnceAndIsOutOfTheIndexSoLaterQuotesPastTheLevelSendNothingMore() {
        armed(AlertDirection.ABOVE, "200.00");
        databaseFires(AlertDirection.ABOVE, "200.00", "201.00");

        evaluator.evaluate(quote("AAPL", "201.00"));
        evaluator.evaluate(quote("AAPL", "202.00"));
        evaluator.evaluate(quote("AAPL", "203.00"));

        verify(gateway).deliver(any());
        assertTrue(index.candidates("AAPL").isEmpty());
    }

    @Test
    void ifAnotherInstanceOrTheCustomerGotThereFirstNothingIsSent() {
        armed(AlertDirection.ABOVE, "200.00");
        when(mapper.markTriggered(anyLong(), any(), any(), any(), any(), any())).thenReturn(0);

        assertEquals(0, evaluator.evaluate(quote("AAPL", "201.00")));

        verifyNoInteractions(gateway);
        assertTrue(index.candidates("AAPL").isEmpty(), "a stale entry is dropped so it is not tried on every quote");
    }

    @Test
    void aSymbolNobodyWatchesCostsNoDatabaseCall() {
        armed(AlertDirection.ABOVE, "200.00");

        assertEquals(0, evaluator.evaluate(quote("MSFT", "400.00")));

        verifyNoInteractions(mapper, gateway);
    }

    @Test
    void whenNotificationsRaisesTheAlertStaysFiredAndIsMarkedFailedForARetry() {
        armed(AlertDirection.ABOVE, "200.00");
        databaseFires(AlertDirection.ABOVE, "200.00", "201.00");
        doThrow(new IllegalStateException("database down")).when(gateway).deliver(any());

        assertEquals(1, evaluator.evaluate(quote("AAPL", "201.00")));

        verify(mapper).recordAlertDelivery(9, "AAPL", AlertDelivery.FAILED);
        assertTrue(index.candidates("AAPL").isEmpty(), "it is not re-fired on the next quote");
    }

    @Test
    void ifRecordingTheStateAlsoFailsTheAlertIsLeftPendingForTheRetryAndNothingEscapes() {
        armed(AlertDirection.ABOVE, "200.00");
        databaseFires(AlertDirection.ABOVE, "200.00", "201.00");
        doThrow(new IllegalStateException("database down")).when(mapper).recordAlertDelivery(anyLong(), any(), any());

        assertEquals(1, evaluator.evaluate(quote("AAPL", "201.00")));
    }

    @Test
    void severalWatchlistsAlertingOnTheSameSymbolEachFireOnTheirOwn() {
        index.put(new AlertWatch(9, "AAPL", AlertDirection.ABOVE, new BigDecimal("200")));
        index.put(new AlertWatch(10, "AAPL", AlertDirection.ABOVE, new BigDecimal("205")));
        when(mapper.markTriggered(anyLong(), any(), any(), any(), any(), any())).thenReturn(1);
        when(mapper.selectTriggeredAlert(anyLong(), any())).thenReturn(Optional.empty());

        assertEquals(1, evaluator.evaluate(quote("AAPL", "201")), "only the 200 alert is crossed");
        assertEquals(1, index.candidates("AAPL").size());
    }

    @Test
    void theMessageForAFallingPriceSaysSo() {
        TriggeredAlert alert = new TriggeredAlert(9, 7, "AAPL", AlertDirection.BELOW, new BigDecimal("150"),
                new BigDecimal("149.5"), FIRED, 0);

        assertEquals("AAPL fell to 149.50, at or below your target of 150.00.", PriceAlertFiring.message(alert));
    }

    @Test
    void pricesKeepUpToFourDecimalsWhenTheyHaveThem() {
        assertEquals("1.2345", PriceAlertFiring.price(new BigDecimal("1.2345")));
        assertEquals("1.20", PriceAlertFiring.price(new BigDecimal("1.2000")));
        assertEquals("200.00", PriceAlertFiring.price(new BigDecimal("200")));
    }
}
