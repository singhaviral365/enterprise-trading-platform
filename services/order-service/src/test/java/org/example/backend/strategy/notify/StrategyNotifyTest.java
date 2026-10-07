package org.example.backend.strategy.notify;

import org.example.backend.entities.Order;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.mapper.OrderMapper;
import org.example.backend.notifications.consumer.StrategyOrderNotices.Notice;
import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.strategy.StrategyFixtures;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StrategyNotifyTest {

    private OrderMapper orders;
    private StrategyMapper strategies;
    private NotificationGateway gateway;

    @BeforeEach
    void setUp() {
        orders = mock(OrderMapper.class);
        strategies = mock(StrategyMapper.class);
        gateway = mock(NotificationGateway.class);
        when(gateway.deliver(any())).thenReturn(GatewayResult.RECORDED);
    }

    private static Order order(String key, int accountId) {
        return new Order(55, key, OrderStatus.FILLED, OffsetDateTime.parse("2026-10-07T10:00:00Z"), OrderSide.BUY,
                OrderPricingType.MARKET, new BigDecimal("149.8000"), 50, OffsetDateTime.parse("2026-10-07T10:00:01Z"), accountId, 2001);
    }

    // ---------------------------------------------------------------- wording

    @Test
    void aFilledStrategyOrderNamesTheStrategyAndTheTrigger() {
        Notice notice = StrategyMessages.forOrderOutcome(
                StrategyFixtures.buyBelow(StrategyStatus.EXECUTING), "ORDER_FILLED", new BigDecimal("149.8"), null);

        assertEquals("Strategy executed", notice.title());
        assertEquals("Strategy #5001 bought 50 AAPL at 149.80 after the price reached your trigger of 150.00.", notice.message());
    }

    @Test
    void aRejectedStrategyOrderGivesTheReasonInPlainWordsAndNeverAnUnknownOne() {
        Strategy strategy = StrategyFixtures.buyBelow(StrategyStatus.ACTIVE);

        assertEquals("Strategy #5001 tried to buy 50 AAPL, but the order was rejected: you did not have enough cash.",
                StrategyMessages.forOrderOutcome(strategy, "ORDER_REJECTED", null, "INSUFFICIENT_FUNDS").message());
        assertEquals("Strategy #5001 tried to buy 50 AAPL, but the order was rejected: it could not be executed.",
                StrategyMessages.forOrderOutcome(strategy, "ORDER_REJECTED", null, "<script>alert(1)</script>").message());
    }

    @Test
    void aCancelledStrategyOrderSaysSo() {
        assertEquals("The order strategy #5001 placed to buy 50 AAPL was cancelled.",
                StrategyMessages.forOrderOutcome(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE), "ORDER_CANCELLED", null, null).message());
    }

    @Test
    void aStoppedAndAnExpiredStrategyEachExplainWhatHappenedAndThatNoMoreOrdersWillBePlaced() {
        Strategy strategy = StrategyFixtures.buyBelow(StrategyStatus.FAILED);

        Notice stopped = StrategyMessages.forStopped(strategy);
        Notice expired = StrategyMessages.forExpired(strategy);

        assertEquals("Strategy stopped", stopped.title());
        assertTrue(stopped.message().contains("after 3 failed attempts in a row"));
        assertTrue(stopped.message().contains("no more orders"));
        assertEquals("Strategy expired", expired.title());
        assertTrue(expired.message().contains("buy 50 AAPL when the price is at or below 150.00"));
    }

    @Test
    void everyMessageFitsTheNotificationLimits() {
        for (Notice notice : List.of(
                StrategyMessages.forOrderOutcome(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE), "ORDER_FILLED", new BigDecimal("1234567.1234"), null),
                StrategyMessages.forStopped(StrategyFixtures.buyBelow(StrategyStatus.FAILED)),
                StrategyMessages.forExpired(StrategyFixtures.buyBelow(StrategyStatus.EXPIRED)))) {
            // Throws if the title or the message is over its limit.
            new NotificationRequest(1, NotificationCategory.STRATEGY_EXECUTION, "k", notice.title(), notice.message());
        }
    }

    // ---------------------------------------------------------------- recognising a strategy's order

    @Test
    void anOrderWithAStrategyKeyIsRecognisedAndItsRunIsSettled() {
        when(orders.selectOrderById(55)).thenReturn(Optional.of(order("strat-5001-1", 1001)));
        when(strategies.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));

        Optional<Notice> notice = new StrategyNoticeProvider(orders, strategies)
                .noticeFor(55, "ORDER_FILLED", new BigDecimal("149.8"), null);

        assertTrue(notice.isPresent());
        assertEquals("Strategy executed", notice.get().title());
        verify(strategies).settleRun(5001, 1, "FILLED");
    }

    @Test
    void theOutcomeIsRecordedAsFilledRejectedOrCancelled() {
        when(orders.selectOrderById(55)).thenReturn(Optional.of(order("strat-5001-2", 1001)));
        when(strategies.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));
        StrategyNoticeProvider provider = new StrategyNoticeProvider(orders, strategies);

        provider.noticeFor(55, "ORDER_REJECTED", null, "INSUFFICIENT_FUNDS");
        provider.noticeFor(55, "ORDER_CANCELLED", null, null);

        verify(strategies).settleRun(5001, 2, "REJECTED");
        verify(strategies).settleRun(5001, 2, "CANCELLED");
    }

    @Test
    void anOrdinaryOrderIsLeftAloneAndNothingIsWritten() {
        when(orders.selectOrderById(55)).thenReturn(Optional.of(order("ord-6f2b1c2a-6a1e", 1001)));

        assertFalse(new StrategyNoticeProvider(orders, strategies).noticeFor(55, "ORDER_FILLED", null, null).isPresent());

        verify(strategies, never()).selectById(anyLong());
        verify(strategies, never()).settleRun(anyLong(), anyInt(), anyString());
    }

    @Test
    void aKeyThatOnlyLooksLikeAStrategysIsNotTrustedWhenTheAccountDoesNotMatch() {
        when(orders.selectOrderById(55)).thenReturn(Optional.of(order("strat-5001-1", 9999)));
        when(strategies.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));

        assertFalse(new StrategyNoticeProvider(orders, strategies).noticeFor(55, "ORDER_FILLED", null, null).isPresent());

        verify(strategies, never()).settleRun(anyLong(), anyInt(), anyString());
    }

    @Test
    void aStrategyKeyForAStrategyThatNoLongerExistsIsAnOrdinaryOrder() {
        when(orders.selectOrderById(55)).thenReturn(Optional.of(order("strat-5001-1", 1001)));
        when(strategies.selectById(5001)).thenReturn(Optional.empty());

        assertFalse(new StrategyNoticeProvider(orders, strategies).noticeFor(55, "ORDER_FILLED", null, null).isPresent());
    }

    @Test
    void anOrderThatDoesNotExistIsAnOrdinaryOrder() {
        when(orders.selectOrderById(55)).thenReturn(Optional.empty());

        assertFalse(new StrategyNoticeProvider(orders, strategies).noticeFor(55, "ORDER_FILLED", null, null).isPresent());
    }

    @Test
    void malformedKeysAreNotMistakenForAStrategysEither() {
        StrategyNoticeProvider provider = new StrategyNoticeProvider(orders, strategies);
        for (String key : List.of("strat-abc-1", "strat-5001", "strat-5001-1-extra", "xstrat-5001-1", "strat--1", "strat-5001-")) {
            when(orders.selectOrderById(55)).thenReturn(Optional.of(order(key, 1001)));

            assertFalse(provider.noticeFor(55, "ORDER_FILLED", null, null).isPresent(), key);
        }
        verify(strategies, never()).selectById(anyLong());
    }

    // ---------------------------------------------------------------- announcing a stopped or expired strategy

    @Test
    void aStoppedStrategyIsAnnouncedOnceUnderTheStrategyCategoryAndThenMarked() {
        when(strategies.selectNeedingAnnouncement(anyInt()))
                .thenReturn(List.of(StrategyFixtures.buyBelow(StrategyStatus.FAILED)));

        new StrategyAnnouncer(strategies, gateway).announce();

        ArgumentCaptor<NotificationRequest> request = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(gateway).deliver(request.capture());
        assertEquals(NotificationCategory.STRATEGY_EXECUTION, request.getValue().category());
        assertEquals("strategy:5001:FAILED", request.getValue().eventKey());
        assertEquals("Strategy stopped", request.getValue().title());
        assertEquals(1001, request.getValue().accountId());
        verify(strategies).markAnnounced(5001);
    }

    @Test
    void anExpiredStrategyGetsTheExpiredWording() {
        when(strategies.selectNeedingAnnouncement(anyInt()))
                .thenReturn(List.of(StrategyFixtures.buyBelow(StrategyStatus.EXPIRED)));

        new StrategyAnnouncer(strategies, gateway).announce();

        ArgumentCaptor<NotificationRequest> request = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(gateway).deliver(request.capture());
        assertEquals("strategy:5001:EXPIRED", request.getValue().eventKey());
        assertEquals("Strategy expired", request.getValue().title());
    }

    @Test
    void aStrategyWhoseNoticeCouldNotBeRecordedIsLeftUnmarkedSoTheNextPassTriesAgain() {
        when(strategies.selectNeedingAnnouncement(anyInt()))
                .thenReturn(List.of(StrategyFixtures.buyBelow(StrategyStatus.FAILED)));
        doThrow(new IllegalStateException("database down")).when(gateway).deliver(any());

        new StrategyAnnouncer(strategies, gateway).announce();

        verify(strategies, never()).markAnnounced(anyLong());
    }

    @Test
    void oneFailureDoesNotStopTheOthersBeingAnnounced() {
        Strategy first = StrategyFixtures.buyBelow(StrategyStatus.FAILED);
        Strategy second = StrategyFixtures.withRuns(StrategyFixtures.buyBelow(StrategyStatus.EXPIRED), 0, 1);
        when(strategies.selectNeedingAnnouncement(anyInt())).thenReturn(List.of(first, second));
        when(gateway.deliver(any())).thenThrow(new IllegalStateException("first fails")).thenReturn(GatewayResult.RECORDED);

        new StrategyAnnouncer(strategies, gateway).announce();

        verify(gateway, org.mockito.Mockito.times(2)).deliver(any());
        verify(strategies, org.mockito.Mockito.times(1)).markAnnounced(anyLong());
    }

    @Test
    void aDatabaseThatCannotBeReadIsLoggedNotThrownSoTheSchedulerKeepsRunning() {
        when(strategies.selectNeedingAnnouncement(anyInt())).thenThrow(new IllegalStateException("no table"));

        new StrategyAnnouncer(strategies, gateway).announce();

        verify(gateway, never()).deliver(any());
    }
}
