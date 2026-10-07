package org.example.backend.service;

import org.example.backend.dto.OrderResponse;
import org.example.backend.dto.PlaceOrderRequest;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.exceptions.AccountLinkConflictException;
import org.example.backend.exceptions.DuplicateOrderException;
import org.example.backend.strategy.StrategyFixtures;
import org.example.backend.strategy.exceptions.StrategyOrderRejectedException;
import org.example.backend.strategy.model.StrategyStatus;
import org.example.backend.strategy.service.StrategyOrderGuard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** An order with a strategy token goes through the ordinary {@link TradeService#placeOrder}, behind the gate. */
class StrategyOrderServiceTest {

    private StrategyOrderGuard guard;
    private TradeService trade;
    private StrategyOrderService service;

    private static final PlaceOrderRequest ORDER =
            new PlaceOrderRequest(1001L, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1");
    private static final OrderResponse PLACED =
            new OrderResponse("77", OrderStatus.NEW, "Order placed successfully", "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null);

    @BeforeEach
    void setUp() {
        guard = mock(StrategyOrderGuard.class);
        trade = mock(TradeService.class);
        service = new StrategyOrderService(guard, trade);
        when(guard.requireMayPlace(5001, ORDER)).thenReturn(StrategyFixtures.buyBelow(StrategyStatus.EXECUTING));
        when(trade.placeOrder(anyLong(), anyString(), any(), any(), anyLong(), any(), anyString())).thenReturn(PLACED);
    }

    @Test
    void anAllowedOrderIsPlacedByTheOrdinaryRouteWithEveryFieldOfTheRequest() {
        assertSame(PLACED, service.place(7, 5001, ORDER));

        verify(trade).placeOrder(1001, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1");
    }

    @Test
    void ownershipIsCheckedFirstThenTheGateThenTheOrderIsPlaced() {
        service.place(7, 5001, ORDER);

        InOrder order = inOrder(trade, guard);
        order.verify(trade).assertUserCanAccessAccount(7, 1001);
        order.verify(guard).requireMayPlace(5001, ORDER);
        order.verify(trade).placeOrder(1001, "AAPL", OrderSide.BUY, OrderPricingType.MARKET, 50, null, "strat-5001-1");
    }

    @Test
    void aTokenWhoseUserDoesNotOwnTheAccountPlacesNothingAndNeverReachesTheGate() {
        doThrow(new AccountLinkConflictException("Account is not linked to authenticated user"))
                .when(trade).assertUserCanAccessAccount(7, 1001);

        assertThrows(AccountLinkConflictException.class, () -> service.place(7, 5001, ORDER));

        verify(guard, never()).requireMayPlace(anyLong(), any());
        verify(trade, never()).placeOrder(anyLong(), anyString(), any(), any(), anyLong(), any(), anyString());
    }

    @Test
    void anOrderTheGateRefusesIsNeverPlaced() {
        when(guard.requireMayPlace(5001, ORDER)).thenThrow(new StrategyOrderRejectedException("DISABLED"));

        assertThrows(StrategyOrderRejectedException.class, () -> service.place(7, 5001, ORDER));

        verify(trade, never()).placeOrder(anyLong(), anyString(), any(), any(), anyLong(), any(), anyString());
    }

    @Test
    void aRepeatedKeyIsTheOrdinaryDuplicateAnswerWhichTheExecutorReadsAsAlreadyPlaced() {
        when(trade.placeOrder(anyLong(), anyString(), any(), any(), anyLong(), any(), anyString()))
                .thenThrow(new DuplicateOrderException("strat-5001-1"));

        DuplicateOrderException ex = assertThrows(DuplicateOrderException.class, () -> service.place(7, 5001, ORDER));

        org.junit.jupiter.api.Assertions.assertEquals("ORD-409", ex.getErrorCode());
    }
}
