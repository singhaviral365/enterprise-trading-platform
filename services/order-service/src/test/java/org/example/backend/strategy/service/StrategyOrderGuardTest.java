package org.example.backend.strategy.service;

import org.example.backend.dto.PlaceOrderRequest;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.strategy.StrategyFixtures;
import org.example.backend.strategy.exceptions.StrategyOrderRejectedException;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The gate an executor's token goes through at the order route: it may place exactly the order the strategy would place, and
 * only while the strategy holds its claim. Whatever is wrong, the answer is the same, and the reason is for the log.
 */
class StrategyOrderGuardTest {

    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-07T10:00:00Z");

    private StrategyMapper mapper;
    private StrategyOrderGuard guard;

    @BeforeEach
    void setUp() {
        mapper = mock(StrategyMapper.class);
        guard = new StrategyOrderGuard(mapper, Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
        claimed(StrategyFixtures.buyBelow(StrategyStatus.EXECUTING));
    }

    private void claimed(Strategy strategy) {
        when(mapper.selectByIdForShare(5001)).thenReturn(Optional.of(strategy));
    }

    private static PlaceOrderRequest order() {
        return new PlaceOrderRequest(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1");
    }

    private static PlaceOrderRequest with(Long account, String symbol, OrderSide side, OrderPricingType type, Integer quantity,
            BigDecimal price, String key) {
        return new PlaceOrderRequest(account, symbol, side, type, quantity, price, key);
    }

    private void refused(PlaceOrderRequest request, String reasonContains) {
        StrategyOrderRejectedException ex =
                assertThrows(StrategyOrderRejectedException.class, () -> guard.requireMayPlace(5001, request));
        assertEquals("STR-403", ex.getErrorCode());
        assertEquals("This order is not permitted for the strategy", ex.getMessage(), "the message never says which check failed");
        assertTrue(ex.getReason().contains(reasonContains), ex.getReason());
    }

    @Test
    void theExactOrderOfAClaimedStrategyIsAllowed() {
        Strategy strategy = guard.requireMayPlace(5001, order());

        assertEquals(5001, strategy.strategyId());
        verify(mapper).selectByIdForShare(5001);
    }

    @Test
    void theSymbolIsComparedIgnoringCase() {
        guard.requireMayPlace(5001, with(1001L, "aapl", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1"));
    }

    @Test
    void aStrategyThatDoesNotExistIsRefused() {
        when(mapper.selectByIdForShare(5001)).thenReturn(Optional.empty());

        refused(order(), "no such strategy");
    }

    @Test
    void aStrategyThatIsNotClaimedIsRefusedWhateverItsStatus() {
        for (StrategyStatus status : StrategyStatus.values()) {
            if (status == StrategyStatus.EXECUTING) {
                continue;
            }
            claimed(StrategyFixtures.buyBelow(status));

            refused(order(), status.name());
        }
    }

    @Test
    void aStrategySwitchedOffBetweenTheClaimAndTheOrderIsRefused() {
        claimed(StrategyFixtures.buyBelow(StrategyStatus.DISABLED));

        refused(order(), "DISABLED");
    }

    @Test
    void aStrategyWhoseWindowHasClosedIsRefusedEvenIfStillClaimed() {
        claimed(StrategyFixtures.withWindowEnd(StrategyFixtures.buyBelow(StrategyStatus.EXECUTING), NOW.minusSeconds(1)));

        refused(order(), "window has closed");
    }

    @Test
    void aStrategyThatHasUsedAllItsRunsIsRefused() {
        claimed(StrategyFixtures.withRuns(StrategyFixtures.buyBelow(StrategyStatus.EXECUTING), 1, 1));

        refused(order(), "all its executions");
    }

    @Test
    void anOrderForAnotherAccountIsRefused() {
        refused(with(1002L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1"), "account");
        refused(with(null, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1"), "account");
    }

    @Test
    void anOrderForAnotherInstrumentIsRefused() {
        refused(with(1001L, "MSFT", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1"), "instrument");
        refused(with(1001L, null, OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1"), "instrument");
    }

    @Test
    void anOrderOnTheOtherSideIsRefused() {
        refused(with(1001L, "AAPL", OrderSide.SELL, OrderPricingType.MARKET, 50, null, "strat-5001-1"), "side");
    }

    @Test
    void aLimitOrderIsRefusedBecauseStrategyOrdersAreMarketOrders() {
        refused(with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.LIMIT, 50, new BigDecimal("1000"), "strat-5001-1"), "market");
    }

    @Test
    void anOrderForADifferentQuantityIsRefused() {
        refused(with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 51, null, "strat-5001-1"), "quantity");
        refused(with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, null, null, "strat-5001-1"), "quantity");
    }

    @Test
    void theIdempotencyKeyMustBeTheOneForTheStrategysNextRun() {
        refused(with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-2"), "key");
        refused(with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5002-1"), "key");
        refused(with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "ord-12345678"), "key");
        refused(with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, null), "key");
    }

    @Test
    void afterARunSucceedsTheNextKeyIsTheNextRun() {
        claimed(StrategyFixtures.withRuns(StrategyFixtures.buyBelow(StrategyStatus.EXECUTING), 1, 3));

        guard.requireMayPlace(5001, with(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-2"));
        refused(order(), "key");
    }

    @Test
    void theStrategyReturnedIsTheOneThatWasLockedAndChecked() {
        Strategy locked = StrategyFixtures.buyBelow(StrategyStatus.EXECUTING);
        claimed(locked);

        assertSame(locked, guard.requireMayPlace(5001, order()));
    }
}
