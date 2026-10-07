package org.example.backend.portfolio.performance;

import org.example.backend.enums.OrderSide;
import org.example.backend.portfolio.ledger.AverageCostLot;
import org.example.backend.portfolio.model.FilledOrder;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HistoryReplayTest {

    private static final LocalDate START = LocalDate.of(2026, 9, 1);

    private static FilledOrder order(long id, int dayOffset, OrderSide side, long quantity, String price) {
        return new FilledOrder(id, "AAPL", side, quantity, new BigDecimal(price),
                OffsetDateTime.parse("2026-09-01T10:00:00Z").plusDays(dayOffset));
    }

    @Test
    void cashAndHoldingsFollowTheOrdersDayByDay() {
        var states = HistoryReplay.replay(START, START.plusDays(3), new BigDecimal("1000"), Map.of(), List.of(
                order(1, 1, OrderSide.BUY, 5, "100.00"),
                order(2, 2, OrderSide.SELL, 2, "120.00")));

        assertEquals(4, states.size());
        assertEquals(0, new BigDecimal("1000").compareTo(states.get(0).cash()));
        assertTrue(states.get(0).lots().isEmpty());
        assertEquals(0, new BigDecimal("500").compareTo(states.get(1).cash()), "5 bought at 100");
        assertEquals(5, states.get(1).lots().get("AAPL").quantity());
        assertEquals(0, new BigDecimal("740").compareTo(states.get(2).cash()), "2 sold at 120");
        assertEquals(3, states.get(2).lots().get("AAPL").quantity());
        assertEquals(new BigDecimal("100.00"), states.get(3).lots().get("AAPL").averageCost(), "a sale never changes the average");
    }

    @Test
    void anOpeningPositionIsHeldFromTheFirstDayAndIsNotChanged() {
        var opening = Map.of("AAPL", new AverageCostLot(10, new BigDecimal("50.00")));

        var states = HistoryReplay.replay(START, START.plusDays(1), new BigDecimal("0"), opening,
                List.of(order(1, 1, OrderSide.SELL, 4, "70.00")));

        assertEquals(10, states.get(0).lots().get("AAPL").quantity());
        assertEquals(6, states.get(1).lots().get("AAPL").quantity());
        assertEquals(10, opening.get("AAPL").quantity(), "the caller's lot is copied, never changed");
    }

    @Test
    void ordersBeforeTheFirstDayAreAppliedOnIt() {
        var states = HistoryReplay.replay(START, START, new BigDecimal("1000"), Map.of(),
                List.of(order(1, -3, OrderSide.BUY, 1, "100.00")));

        assertEquals(0, new BigDecimal("900").compareTo(states.get(0).cash()));
    }

    @Test
    void aPositionSoldDownToNothingIsNotListed() {
        var states = HistoryReplay.replay(START, START.plusDays(1), new BigDecimal("1000"), Map.of(), List.of(
                order(1, 0, OrderSide.BUY, 2, "100.00"), order(2, 1, OrderSide.SELL, 2, "110.00")));

        assertTrue(states.get(1).lots().isEmpty());
    }
}
