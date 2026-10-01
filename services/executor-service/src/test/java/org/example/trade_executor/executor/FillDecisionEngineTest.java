package org.example.trade_executor.executor;

import org.example.trade_executor.client.LiveQuote;
import org.example.backend.entities.Order;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class FillDecisionEngineTest {

    private final FillDecisionEngine fillDecisionEngine = new FillDecisionEngine();

    @Test
    void buyLimitAtOrAboveQuoteFillsAtQuote() {
        ExecutionOutcome outcome = fillDecisionEngine.decide(
                order(OrderSide.BUY, OrderPricingType.LIMIT, new BigDecimal("50.00")),
                new LiveQuote("ACME", new BigDecimal("49.1256")));

        assertEquals(OrderStatus.FILLED, outcome.status());
        assertEquals(new BigDecimal("49.1256"), outcome.executionPrice());
        assertNull(outcome.rejectReason());
    }

    @Test
    void sellLimitAtOrBelowQuoteFillsAtQuote() {
        ExecutionOutcome outcome = fillDecisionEngine.decide(
                order(OrderSide.SELL, OrderPricingType.LIMIT, new BigDecimal("49.00")),
                new LiveQuote("ACME", new BigDecimal("49.1256")));

        assertEquals(OrderStatus.FILLED, outcome.status());
        assertEquals(new BigDecimal("49.1256"), outcome.executionPrice());
        assertNull(outcome.rejectReason());
    }

    @Test
    void orderOutsideMarketableRangeIsRejected() {
        ExecutionOutcome outcome = fillDecisionEngine.decide(
                order(OrderSide.BUY, OrderPricingType.LIMIT, new BigDecimal("48.00")),
                new LiveQuote("ACME", new BigDecimal("49.1256")));

        assertEquals(OrderStatus.REJECTED, outcome.status());
        assertEquals(ExecutionRejectReason.OUTSIDE_MARKETABLE_RANGE, outcome.rejectReason());
        assertNull(outcome.executionPrice());
    }

    @Test
    void marketOrderFillsAtQuoteWithoutLimitChecks() {
        ExecutionOutcome outcome = fillDecisionEngine.decide(
                order(OrderSide.BUY, OrderPricingType.MARKET, null),
                new LiveQuote("ACME", new BigDecimal("49.1256")));

        assertEquals(OrderStatus.FILLED, outcome.status());
        assertEquals(new BigDecimal("49.1256"), outcome.executionPrice());
        assertNull(outcome.rejectReason());
    }

    private static Order order(
            OrderSide side,
            OrderPricingType pricingType,
            BigDecimal price) {

        return new Order(
                1L,
                "idem-1",
                OrderStatus.NEW,
                OffsetDateTime.parse("2026-09-17T10:15:30Z"),
                side,
                pricingType,
                price,
                100L,
                null,
                1,
                101);
    }
}

