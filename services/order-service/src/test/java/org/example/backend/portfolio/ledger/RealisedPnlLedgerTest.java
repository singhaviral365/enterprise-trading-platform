package org.example.backend.portfolio.ledger;

import org.example.backend.entities.Account;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderSide;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.portfolio.consumer.FilledSellConsumer;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Realised profit and loss is booked at the sale and stays as booked: nothing about a later order, or a price, reaches
 * back into it.
 */
class RealisedPnlLedgerTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-01T10:00:00Z");

    private InMemoryPortfolioMapper mapper;
    private RealisedPnlLedger ledger;
    private RealisedPnlReconciler reconciler;

    private static FilledOrder order(long id, OrderSide side, long quantity, String price) {
        return new FilledOrder(id, "AAPL", side, quantity, new BigDecimal(price), T0.plusMinutes(id));
    }

    @BeforeEach
    void setUp() {
        mapper = new InMemoryPortfolioMapper();
        ledger = new RealisedPnlLedger(mapper);
        AccountMapper accounts = mock(AccountMapper.class);
        when(accounts.selectAccountById(anyInt())).thenReturn(Optional.of(new Account(
                7, "ACC000000007", LocalDate.of(2026, 1, 1), new BigDecimal("1000"), new BigDecimal("1000"),
                AccountStatus.ACTIVE, "USD", 1L, null, null, 1000)));
        reconciler = new RealisedPnlReconciler(mapper, ledger, accounts);
    }

    @Test
    void booksAtTheSaleAndIgnoresLaterPrices() {
        mapper.fill(7, order(1, OrderSide.BUY, 10, "100.00"));
        mapper.fill(7, order(2, OrderSide.BUY, 10, "120.00"));
        mapper.fill(7, order(3, OrderSide.SELL, 5, "130.00"));

        assertEquals(1, reconciler.reconcileAccount(7));
        assertEquals(new BigDecimal("100.00"), ledger.total(7, null, null));

        // The market moves, the account buys more at a very different price: what was booked does not move.
        mapper.fill(7, order(4, OrderSide.BUY, 100, "500.00"));
        assertEquals(0, reconciler.reconcileAccount(7));

        assertEquals(new BigDecimal("100.00"), ledger.total(7, null, null));
        var booked = mapper.entries.get(3L);
        assertEquals(new BigDecimal("110.00"), booked.averageCostAtSale(), "the cost at the moment of the sale, not today's average");
        assertEquals("USD", booked.currency());
        assertEquals(T0.plusMinutes(3), booked.bookedAt());
    }

    @Test
    void aSaleIsBookedOnceWhoeverAsks() {
        mapper.fill(7, order(1, OrderSide.BUY, 10, "100.00"));
        mapper.fill(7, order(2, OrderSide.SELL, 5, "130.00"));

        assertEquals(1, reconciler.reconcileAccount(7));
        assertEquals(0, reconciler.reconcileAccount(7));
        assertEquals(0, reconciler.reconcileAccount(7));

        assertEquals(1, mapper.entries.size());
        assertEquals(new BigDecimal("150.00"), ledger.total(7, null, null));
    }

    @Test
    void anAccountWithNothingToBookIsNotReplayedAtAll() {
        mapper.fill(7, order(1, OrderSide.BUY, 10, "100.00"));

        assertEquals(0, reconciler.reconcileAccount(7));

        assertEquals(0, mapper.selectFilledOrdersCalls, "the common case is a single cheap count");
    }

    @Test
    void aSaleTheHistoryDoesNotSupportIsNotBookedAndNotGuessed() {
        mapper.fill(7, order(1, OrderSide.BUY, 2, "100.00"));
        mapper.fill(7, order(2, OrderSide.SELL, 5, "130.00"));

        assertEquals(0, reconciler.reconcileAccount(7));

        assertTrue(mapper.entries.isEmpty());
    }

    @Test
    void totalsAreBoundedByTheBookingTime() {
        mapper.fill(7, order(1, OrderSide.BUY, 10, "100.00"));
        mapper.fill(7, order(2, OrderSide.SELL, 1, "110.00"));
        mapper.fill(7, new FilledOrder(3, "AAPL", OrderSide.SELL, 1, new BigDecimal("120.00"), T0.plusDays(2)));
        reconciler.reconcileAccount(7);

        assertEquals(new BigDecimal("30.00"), ledger.total(7, null, null));
        assertEquals(new BigDecimal("10.00"), ledger.total(7, null, T0.plusDays(1)));
        assertEquals(new BigDecimal("20.00"), ledger.total(7, T0.plusDays(1), null));
        assertEquals(BigDecimal.ZERO, ledger.total(99, null, null), "an account with nothing booked has zero, not null");
    }

    @Test
    void reconcilingEveryAccountSurvivesOneThatFails() {
        mapper.fill(7, order(1, OrderSide.BUY, 10, "100.00"));
        mapper.fill(7, order(2, OrderSide.SELL, 5, "130.00"));
        mapper.fill(8, new FilledOrder(10, "AAPL", OrderSide.BUY, 10, new BigDecimal("100.00"), T0));
        mapper.fill(8, new FilledOrder(11, "AAPL", OrderSide.SELL, 5, new BigDecimal("110.00"), T0.plusMinutes(1)));
        mapper.failAccount = 7L;
        mapper.failFor = new IllegalStateException("database hiccup");

        int booked = reconciler.reconcileAll();

        assertEquals(1, booked, "account 8 is still booked");
        assertTrue(mapper.entries.containsKey(11L));
    }

    @Test
    void aReplayedEventDoesNotDoubleCountRealisedProfitAndLoss() {
        mapper.fill(7, order(1, OrderSide.BUY, 10, "100.00"));
        mapper.fill(7, order(2, OrderSide.SELL, 5, "130.00"));
        FilledSellConsumer consumer = new FilledSellConsumer(reconciler);
        String event = """
                {"eventId":"e-1","eventType":"ORDER_FILLED","payload":{"orderId":2,"accountId":7,"symbol":"AAPL",
                 "side":"SELL","quantity":5,"executionPrice":130.00}}""";

        assertEquals(1, consumer.handle(event));
        assertEquals(0, consumer.handle(event), "Kafka delivers at least once: the replay books nothing");
        assertEquals(0, consumer.handle(event));

        assertEquals(1, mapper.entries.size());
        assertEquals(new BigDecimal("150.00"), ledger.total(7, null, null));
    }

    @Test
    void sellingAHoldingThatHasNoBuyOrdersBehindItIsBookedFromTheHoldingsCost() {
        // A seeded holding: 10 @ 50.00, no orders. The customer sells 4 @ 70.00 and the holding now shows 6 @ 50.00.
        mapper.fill(7, order(1, OrderSide.SELL, 4, "70.00"));
        mapper.hold(7, new HoldingSnapshot("AAPL", 6, new BigDecimal("50.00")));

        assertEquals(1, reconciler.reconcileAccount(7));

        assertEquals(new BigDecimal("80.00"), ledger.total(7, null, null));
        assertEquals(new BigDecimal("50.00"), mapper.entries.get(1L).averageCostAtSale());
    }

    @Test
    void theSameSaleIsRefusedWhenNothingSaysWhatWasHeld() {
        mapper.fill(7, order(1, OrderSide.SELL, 4, "70.00"));

        assertEquals(0, reconciler.reconcileAccount(7));

        assertTrue(mapper.entries.isEmpty());
    }
}
