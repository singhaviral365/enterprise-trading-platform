package org.example.trade_executor.service;

import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.entities.Instrument;
import org.example.backend.entities.Order;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.trade_executor.events.OrderResolvedEvent;
import org.example.trade_executor.executor.ExecutionOutcome;
import org.example.trade_executor.executor.ExecutionRejectReason;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderSettlementServiceTest {

    @Mock
    private AccountMapper accountMapper;

    @Mock
    private HoldingMapper holdingMapper;

    @Mock
    private InstrumentMapper instrumentMapper;

    @Mock
    private OrderMapper orderMapper;

    private OrderSettlementService orderSettlementService;

    @BeforeEach
    void setUp() {
        orderSettlementService = new OrderSettlementService(
                accountMapper,
                holdingMapper,
                instrumentMapper,
                orderMapper);
    }

    @Test
    void executionTimeRecheckRejectsOrderWhoseAccountCanNoLongerAffordIt() {
        Order order = order(OrderSide.BUY, OrderPricingType.MARKET, null, 100L);
        Instrument instrument = instrument();
        Account account = account(AccountStatus.ACTIVE, new BigDecimal("1000.00"), 4L);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(accountMapper.selectAccountById(1)).thenReturn(Optional.of(account));
        when(orderMapper.rejectOrderIfNew(anyLong(), any())).thenReturn(1);

        Optional<OrderResolvedEvent> resolvedEvent = orderSettlementService.settle(
                1L,
                ExecutionOutcome.filled(new BigDecimal("50.1234")));

        verify(orderMapper).rejectOrderIfNew(anyLong(), any());
        verify(accountMapper, never()).updateAccountBalanceWithVersion(anyInt(), any(BigDecimal.class), anyLong());
        verify(holdingMapper, never()).insertHolding(any(Holding.class));

        assertTrue(resolvedEvent.isPresent());
        assertEquals("ORDER_REJECTED", resolvedEvent.get().eventType());
        assertEquals(ExecutionRejectReason.INSUFFICIENT_FUNDS, resolvedEvent.get().rejectReason());
    }

    @Test
    void suspendedAccountDoesNotTrade() {
        Order order = order(OrderSide.BUY, OrderPricingType.MARKET, null, 10L);
        Instrument instrument = instrument();
        Account account = account(AccountStatus.SUSPENDED, new BigDecimal("10000.00"), 4L);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(accountMapper.selectAccountById(1)).thenReturn(Optional.of(account));
        when(orderMapper.rejectOrderIfNew(anyLong(), any())).thenReturn(1);

        Optional<OrderResolvedEvent> resolvedEvent = orderSettlementService.settle(
                1L,
                ExecutionOutcome.filled(new BigDecimal("50.1234")));

        verify(orderMapper).rejectOrderIfNew(anyLong(), any());
        verify(accountMapper, never()).updateAccountBalanceWithVersion(anyInt(), any(BigDecimal.class), anyLong());

        assertTrue(resolvedEvent.isPresent());
        assertEquals("ORDER_REJECTED", resolvedEvent.get().eventType());
        assertEquals(ExecutionRejectReason.ACCOUNT_NOT_ACTIVE, resolvedEvent.get().rejectReason());
    }

    @Test
    void fillPersistsStatusCashAndPositionInOrder() {
        Order order = order(OrderSide.BUY, OrderPricingType.MARKET, null, 10L);
        Instrument instrument = instrument();
        Account account = account(AccountStatus.ACTIVE, new BigDecimal("1000.00"), 4L);
        Holding existingHolding = new Holding(77L, 5L, new BigDecimal("20.00"), 1, 101);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(accountMapper.selectAccountById(1)).thenReturn(Optional.of(account));
        when(orderMapper.fillOrderIfNew(anyLong(), any(BigDecimal.class), any())).thenReturn(1);
        when(accountMapper.updateAccountBalanceWithVersion(anyInt(), any(BigDecimal.class), anyLong())).thenReturn(1);
        when(holdingMapper.selectHoldingByAccountAndInstrument(1, 101)).thenReturn(Optional.of(existingHolding));
        when(holdingMapper.updateHoldingQuantityAndPrice(anyLong(), anyLong(), any(BigDecimal.class))).thenReturn(1);

        Optional<OrderResolvedEvent> resolvedEvent = orderSettlementService.settle(
                1L,
                ExecutionOutcome.filled(new BigDecimal("50.00")));

        var inOrder = inOrder(orderMapper, accountMapper, holdingMapper);
        inOrder.verify(orderMapper).fillOrderIfNew(anyLong(), any(BigDecimal.class), any());
        inOrder.verify(accountMapper).updateAccountBalanceWithVersion(anyInt(), any(BigDecimal.class), anyLong());
        inOrder.verify(holdingMapper).updateHoldingQuantityAndPrice(anyLong(), anyLong(), any(BigDecimal.class));

        assertTrue(resolvedEvent.isPresent());
        assertEquals("ORDER_FILLED", resolvedEvent.get().eventType());
    }

    @Test
    void failureInPositionUpdateSignalsRollbackForWholeSettlement() {
        Order order = order(OrderSide.BUY, OrderPricingType.MARKET, null, 10L);
        Instrument instrument = instrument();
        Account account = account(AccountStatus.ACTIVE, new BigDecimal("1000.00"), 4L);
        Holding existingHolding = new Holding(77L, 5L, new BigDecimal("20.00"), 1, 101);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(accountMapper.selectAccountById(1)).thenReturn(Optional.of(account));
        when(orderMapper.fillOrderIfNew(anyLong(), any(BigDecimal.class), any())).thenReturn(1);
        when(accountMapper.updateAccountBalanceWithVersion(anyInt(), any(BigDecimal.class), anyLong())).thenReturn(1);
        when(holdingMapper.selectHoldingByAccountAndInstrument(1, 101)).thenReturn(Optional.of(existingHolding));
        when(holdingMapper.updateHoldingQuantityAndPrice(anyLong(), anyLong(), any(BigDecimal.class))).thenReturn(0);

        assertThrows(
                IllegalStateException.class,
                () -> orderSettlementService.settle(1L, ExecutionOutcome.filled(new BigDecimal("50.00"))));
    }

    @Test
    void duplicateDeliveryWithZeroUpdatedRowsPublishesNothing() {
        Order order = order(OrderSide.BUY, OrderPricingType.MARKET, null, 10L);
        Instrument instrument = instrument();
        Account account = account(AccountStatus.ACTIVE, new BigDecimal("1000.00"), 4L);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(accountMapper.selectAccountById(1)).thenReturn(Optional.of(account));
        when(orderMapper.fillOrderIfNew(anyLong(), any(BigDecimal.class), any())).thenReturn(0);

        Optional<OrderResolvedEvent> resolvedEvent = orderSettlementService.settle(
                1L,
                ExecutionOutcome.filled(new BigDecimal("50.00")));

        verify(accountMapper, never()).updateAccountBalanceWithVersion(anyInt(), any(BigDecimal.class), anyLong());
        verify(holdingMapper, never()).updateHoldingQuantity(anyLong(), anyLong());
        verify(holdingMapper, never()).updateHoldingQuantityAndPrice(anyLong(), anyLong(), any(BigDecimal.class));
        assertFalse(resolvedEvent.isPresent());
    }

    @Test
    void optimisticLockConflictRaisesErrorForRetryCaller() {
        Order order = order(OrderSide.BUY, OrderPricingType.MARKET, null, 10L);
        Instrument instrument = instrument();
        Account account = account(AccountStatus.ACTIVE, new BigDecimal("1000.00"), 4L);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(accountMapper.selectAccountById(1)).thenReturn(Optional.of(account));
        when(orderMapper.fillOrderIfNew(anyLong(), any(BigDecimal.class), any())).thenReturn(1);
        when(accountMapper.updateAccountBalanceWithVersion(anyInt(), any(BigDecimal.class), anyLong())).thenReturn(0);

        assertThrows(
                OptimisticLockException.class,
                () -> orderSettlementService.settle(1L, ExecutionOutcome.filled(new BigDecimal("50.00"))));
    }

    private static Order order(
            OrderSide side,
            OrderPricingType pricingType,
            BigDecimal price,
            long quantity) {

        return new Order(
                1L,
                "idem-1",
                OrderStatus.NEW,
                OffsetDateTime.parse("2026-09-17T09:15:30Z"),
                side,
                pricingType,
                price,
                quantity,
                null,
                1,
                101);
    }

    private static Instrument instrument() {
        return new Instrument(
                101,
                "ACME",
                "Acme Corp",
                InstrumentAssetClass.EQUITY,
                InstrumentStatus.TRADING);
    }

    private static Account account(
            AccountStatus status,
            BigDecimal balance,
            long version) {

        return new Account(
                1,
                "ACC-000001",
                LocalDate.of(2024, 1, 1),
                balance,
                balance,
                status,
                "USD",
                version,
                null,
                null,
                11);
    }
}


