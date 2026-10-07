package org.example.backend.portfolio.ledger;

import org.example.backend.enums.OrderSide;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The replay must reproduce the executor's weighted-average rule, including its rounding, exactly. */
class AverageCostReplayTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-01T10:00:00Z");

    private static FilledOrder order(long id, String symbol, OrderSide side, long quantity, String price) {
        return new FilledOrder(id, symbol, side, quantity, new BigDecimal(price), T0.plusMinutes(id));
    }

    @Test
    void aSaleIsBookedAtTheAverageCostOfTheBuysBeforeIt() {
        // Buy 10 @ 100 and 10 @ 120: average 110. Sell 5 @ 130: realised (130 - 110) * 5 = 100.
        var result = AverageCostReplay.replay(List.of(
                order(1, "AAPL", OrderSide.BUY, 10, "100.00"),
                order(2, "AAPL", OrderSide.BUY, 10, "120.00"),
                order(3, "AAPL", OrderSide.SELL, 5, "130.00")));

        assertEquals(1, result.sales().size());
        var sale = result.sales().get(0);
        assertEquals(3L, sale.orderId());
        assertEquals(new BigDecimal("110.00"), sale.averageCostAtSale());
        assertEquals(new BigDecimal("100.00"), sale.realisedPnl());
        assertTrue(result.unreconcilable().isEmpty());
    }

    @Test
    void aSaleNeverChangesTheAverageSoTheNextSaleUsesTheSameOne() {
        var result = AverageCostReplay.replay(List.of(
                order(1, "AAPL", OrderSide.BUY, 20, "110.00"),
                order(2, "AAPL", OrderSide.SELL, 5, "130.00"),
                order(3, "AAPL", OrderSide.SELL, 5, "100.00")));

        assertEquals(new BigDecimal("100.00"), result.sales().get(0).realisedPnl());
        assertEquals(new BigDecimal("110.00"), result.sales().get(1).averageCostAtSale());
        assertEquals(new BigDecimal("-50.00"), result.sales().get(1).realisedPnl(), "a sale below cost is a loss");
    }

    @Test
    void theAverageRoundsHalfUpToTwoPlacesLikeTheExecutor() {
        // (3 * 10.00 + 4 * 10.01) / 7 = 10.005714... -> 10.01
        var result = AverageCostReplay.replay(List.of(
                order(1, "AAPL", OrderSide.BUY, 3, "10.00"),
                order(2, "AAPL", OrderSide.BUY, 4, "10.01"),
                order(3, "AAPL", OrderSide.SELL, 1, "11.00")));

        assertEquals(new BigDecimal("10.01"), result.sales().get(0).averageCostAtSale());
        assertEquals(new BigDecimal("0.99"), result.sales().get(0).realisedPnl());
    }

    @Test
    void sellingEverythingAndBuyingAgainStartsAFreshAverage() {
        var result = AverageCostReplay.replay(List.of(
                order(1, "AAPL", OrderSide.BUY, 1, "100.00"),
                order(2, "AAPL", OrderSide.SELL, 1, "110.00"),
                order(3, "AAPL", OrderSide.BUY, 1, "200.00"),
                order(4, "AAPL", OrderSide.SELL, 1, "210.00")));

        assertEquals(new BigDecimal("10.00"), result.sales().get(0).realisedPnl());
        assertEquals(new BigDecimal("200.00"), result.sales().get(1).averageCostAtSale());
        assertEquals(new BigDecimal("10.00"), result.sales().get(1).realisedPnl());
    }

    @Test
    void eachInstrumentHasItsOwnAverage() {
        var result = AverageCostReplay.replay(List.of(
                order(1, "AAPL", OrderSide.BUY, 10, "100.00"),
                order(2, "INFY.NS", OrderSide.BUY, 10, "20.00"),
                order(3, "INFY.NS", OrderSide.SELL, 10, "25.00")));

        assertEquals(1, result.sales().size());
        assertEquals("INFY.NS", result.sales().get(0).tickerSymbol());
        assertEquals(new BigDecimal("50.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void aSaleTheHistoryCannotSupportIsReportedAndNeverGuessed() {
        var result = AverageCostReplay.replay(List.of(
                order(1, "AAPL", OrderSide.BUY, 2, "100.00"),
                order(2, "AAPL", OrderSide.SELL, 5, "130.00")));

        assertTrue(result.sales().isEmpty());
        assertEquals(List.of(2L), result.unreconcilable());
    }

    // ---------------------------------------------------------------- a holding the orders do not explain

    private static Map<String, HoldingSnapshot> holding(String symbol, long quantity, String averageCost) {
        return Map.of(symbol, new HoldingSnapshot(symbol, quantity, new BigDecimal(averageCost)));
    }

    @Test
    void sellingAHoldingThatHasNoBuysBehindItIsStillBooked() {
        // 10 held at 50.00 (seeded, no orders). Sell 4 @ 70: the holding now shows 6 @ 50.00. Realised (70 - 50) * 4 = 80.
        var result = AverageCostReplay.replay(
                List.of(order(1, "AAPL", OrderSide.SELL, 4, "70.00")),
                holding("AAPL", 6, "50.00"));

        assertTrue(result.unreconcilable().isEmpty());
        assertEquals(1, result.sales().size());
        assertEquals(new BigDecimal("50.00"), result.sales().get(0).averageCostAtSale());
        assertEquals(new BigDecimal("80.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void withoutKnowingTheHoldingTheSameSaleIsRefusedNotGuessed() {
        var result = AverageCostReplay.replay(List.of(order(1, "AAPL", OrderSide.SELL, 4, "70.00")));

        assertTrue(result.sales().isEmpty());
        assertEquals(List.of(1L), result.unreconcilable());
    }

    @Test
    void aSeededHoldingSoldDownToNothingKeepsItsCost() {
        // The executor leaves the row at quantity 0 with the average unchanged: 10 @ 50.00 sold at 70 is a profit of 200.
        var result = AverageCostReplay.replay(
                List.of(order(1, "AAPL", OrderSide.SELL, 10, "70.00")),
                holding("AAPL", 0, "50.00"));

        assertEquals(new BigDecimal("200.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void theOpeningCostIsRecoveredFromTheAverageAfterLaterBuys() {
        // Opening 10 @ 50. Buy 10 @ 70 -> 20 @ 60.00. Sell 5 @ 80 -> 15 @ 60.00. The holding shows 15 @ 60.00.
        // Working backwards gives an opening cost of 50.00, and the sale is booked at the average then: 60.00.
        var result = AverageCostReplay.replay(
                List.of(
                        order(1, "AAPL", OrderSide.BUY, 10, "70.00"),
                        order(2, "AAPL", OrderSide.SELL, 5, "80.00")),
                holding("AAPL", 15, "60.00"));

        assertEquals(1, result.sales().size());
        assertEquals(new BigDecimal("60.00"), result.sales().get(0).averageCostAtSale());
        assertEquals(new BigDecimal("100.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void aSaleBeforeALaterBuyUsesTheCostBeforeThatBuy() {
        // Opening 10 @ 50. Sell 4 @ 70 (avg 50), then buy 10 @ 80: 6 @ 50 + 10 @ 80 = 16 @ 68.75 -> 68.75.
        var result = AverageCostReplay.replay(
                List.of(
                        order(1, "AAPL", OrderSide.SELL, 4, "70.00"),
                        order(2, "AAPL", OrderSide.BUY, 10, "80.00")),
                holding("AAPL", 16, "68.75"));

        assertEquals(new BigDecimal("50.00"), result.sales().get(0).averageCostAtSale());
        assertEquals(new BigDecimal("80.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void whenTheOrdersAlreadyExplainTheHoldingThereIsNoOpeningPosition() {
        var result = AverageCostReplay.replay(
                List.of(
                        order(1, "AAPL", OrderSide.BUY, 10, "100.00"),
                        order(2, "AAPL", OrderSide.SELL, 4, "130.00")),
                holding("AAPL", 6, "100.00"));

        assertEquals(new BigDecimal("100.00"), result.sales().get(0).averageCostAtSale());
        assertEquals(new BigDecimal("120.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void soldMoreThanBoughtMeansTheDifferenceWasHeldBeforeTheOrders() {
        // 10 bought and 12 sold, and nothing held now: 2 were already there. Their cost is the one that makes the
        // average after the buy 100.00, which is 100.00; the sale of 12 is booked against it.
        var result = AverageCostReplay.replay(
                List.of(
                        order(1, "AAPL", OrderSide.BUY, 10, "100.00"),
                        order(2, "AAPL", OrderSide.SELL, 12, "130.00")),
                holding("AAPL", 0, "100.00"));

        assertTrue(result.unreconcilable().isEmpty());
        assertEquals(new BigDecimal("360.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void aSaleThatTheOrderInWhichThingsHappenedCannotSupportIsStillRefused() {
        // Sold 5 before anything was bought, and the holding says 5 are held (10 bought - 5 sold): there is no opening
        // position to sell from, so the first sale cannot be priced and is not guessed.
        var result = AverageCostReplay.replay(
                List.of(
                        order(1, "AAPL", OrderSide.SELL, 5, "70.00"),
                        order(2, "AAPL", OrderSide.BUY, 10, "80.00")),
                holding("AAPL", 5, "80.00"));

        assertTrue(result.sales().isEmpty());
        assertEquals(List.of(1L), result.unreconcilable());
    }

    @Test
    void aHoldingSmallerThanTheOrdersImplyAddsNoOpeningPosition() {
        var result = AverageCostReplay.replay(
                List.of(
                        order(1, "AAPL", OrderSide.BUY, 10, "100.00"),
                        order(2, "AAPL", OrderSide.SELL, 2, "130.00")),
                holding("AAPL", 3, "100.00"));

        assertEquals(new BigDecimal("100.00"), result.sales().get(0).averageCostAtSale());
        assertEquals(new BigDecimal("60.00"), result.sales().get(0).realisedPnl());
    }

    @Test
    void whenThePositionWentThroughZeroTheHoldingsOwnAverageStandsInForTheOpeningCost() {
        // Opening 5 sold out, then 5 bought @ 90: the final average (90) says nothing about the opening cost.
        // The holding's average is used for it, and the first sale is booked rather than skipped.
        var result = AverageCostReplay.replay(
                List.of(
                        order(1, "AAPL", OrderSide.SELL, 5, "70.00"),
                        order(2, "AAPL", OrderSide.BUY, 5, "90.00")),
                holding("AAPL", 5, "90.00"));

        assertEquals(1, result.sales().size());
        assertEquals(new BigDecimal("90.00"), result.sales().get(0).averageCostAtSale());
    }

    @Test
    void aHoldingOfAnotherInstrumentIsIgnored() {
        var result = AverageCostReplay.replay(
                List.of(order(1, "AAPL", OrderSide.SELL, 4, "70.00")),
                holding("MSFT", 6, "50.00"));

        assertEquals(List.of(1L), result.unreconcilable());
    }
}
