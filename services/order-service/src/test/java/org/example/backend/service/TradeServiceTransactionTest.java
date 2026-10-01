package org.example.backend.service;

import org.example.backend.dto.OrderResponse;
import org.example.backend.entities.Account;
import org.example.backend.entities.Instrument;
import org.example.backend.entities.Order;
import org.example.backend.events.OrderPlacedAfterCommitListener;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.DuplicateOrderException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.exceptions.OrderNotCancellableException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TradeServiceTransactionTest {

    private static final int ACCOUNT_ID = 1;
    private static final int INSTRUMENT_ID = 101;

    @Mock
    private AccountMapper accountMapper;

    @Mock
    private HoldingMapper holdingMapper;

    @Mock
    private InstrumentMapper instrumentMapper;

    @Mock
    private OrderMapper orderMapper;

    @Mock
    private OrderPlacedAfterCommitListener orderPlacedAfterCommitListener;

    private TradeService tradeService;

    @BeforeEach
    void setUp() {
        tradeService = new TradeService(
                accountMapper,
                holdingMapper,
                instrumentMapper,
                orderMapper,
                orderPlacedAfterCommitListener);
    }

    @Test
    void acceptedOrderIsWrittenAtNewAndAnswersNew() {
        Account account = activeAccount(new BigDecimal("25000.00"), 3L);
        Instrument instrument = tradableInstrument();

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(account));
        when(instrumentMapper.selectInstrumentByTicker("ACME"))
                .thenReturn(Optional.of(instrument));
        when(orderMapper.selectOrderByIdempotencyKey("idem-commit"))
                .thenReturn(Optional.empty());
        when(orderMapper.nextOrderId())
                .thenReturn(9001L);

        OrderResponse response = tradeService.placeOrder(
                ACCOUNT_ID,
                "ACME",
                OrderSide.BUY,
                OrderPricingType.LIMIT,
                100L,
                new BigDecimal("50.00"),
                "idem-commit");

        assertEquals("9001", response.orderId());
        assertEquals(OrderStatus.NEW, response.status());
        assertEquals("ACME", response.symbol());
        assertEquals(OrderSide.BUY, response.side());
        assertEquals(OrderPricingType.LIMIT, response.orderPricingType());
        assertEquals(100, response.quantity());
        assertEquals(new BigDecimal("50.0000"), response.price());

        ArgumentCaptor<Order> orderCaptor = ArgumentCaptor.forClass(Order.class);

        InOrder orderedCalls = inOrder(orderMapper, orderPlacedAfterCommitListener);
        orderedCalls.verify(orderMapper)
                .insertOrder(orderCaptor.capture());
        orderedCalls.verify(orderPlacedAfterCommitListener)
                .onOrderPlaced(any());

        assertEquals(OrderStatus.NEW, orderCaptor.getValue().getOrderStatus());
        assertEquals(new BigDecimal("50.0000"), orderCaptor.getValue().getPrice());
        verify(accountMapper, never()).updateAccountBalanceWithVersion(anyInt(), any(), anyLong());
        verify(holdingMapper, never()).insertHolding(any());
        verify(holdingMapper, never()).updateHoldingQuantity(anyLong(), anyLong());
        verify(holdingMapper, never()).updateHoldingQuantityAndPrice(anyLong(), anyLong(), any());
    }

    @Test
    void acceptedOrderWithoutLimitPriceIsWrittenAtNewAndAnswersNew() {
        Account account = activeAccount(new BigDecimal("25000.00"), 3L);
        Instrument instrument = tradableInstrument();

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(account));
        when(instrumentMapper.selectInstrumentByTicker("ACME"))
                .thenReturn(Optional.of(instrument));
        when(orderMapper.selectOrderByIdempotencyKey("idem-market"))
                .thenReturn(Optional.empty());
        when(orderMapper.nextOrderId())
                .thenReturn(9002L);

        OrderResponse response = tradeService.placeOrder(
                ACCOUNT_ID,
                "ACME",
                OrderSide.BUY,
                OrderPricingType.MARKET,
                100L,
                null,
                "idem-market");

        assertEquals("9002", response.orderId());
        assertEquals(OrderStatus.NEW, response.status());
        assertEquals(OrderPricingType.MARKET, response.orderPricingType());
        assertNull(response.price());

        ArgumentCaptor<Order> orderCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderMapper).insertOrder(orderCaptor.capture());
        verify(orderPlacedAfterCommitListener).onOrderPlaced(any());
                assertEquals(new BigDecimal("0.0001"), orderCaptor.getValue().getPrice());
    }

    @Test
    void orderThatFailsValidationPublishesNothing() {
        Account account = activeAccount(new BigDecimal("25000.00"), 7L);

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(account));
        when(instrumentMapper.selectInstrumentByTicker("ACME"))
                .thenReturn(Optional.empty());

        assertThrows(
                InstrumentNotFoundException.class,
                () -> tradeService.placeOrder(
                        ACCOUNT_ID,
                        "ACME",
                        OrderSide.BUY,
                        OrderPricingType.LIMIT,
                        100L,
                        new BigDecimal("50.00"),
                        "idem-invalid"));

        verify(orderMapper, never()).insertOrder(any(Order.class));
        verify(orderPlacedAfterCommitListener, never()).onOrderPlaced(any());
    }

    @Test
    void duplicateIdempotencyKeyPublishesNothing() {
        Account account = activeAccount(new BigDecimal("25000.00"), 3L);
        Instrument instrument = tradableInstrument();
        Order duplicate = new Order(
                8001L,
                "idem-duplicate",
                OrderStatus.NEW,
                OffsetDateTime.parse("2026-09-10T09:00:00Z"),
                OrderSide.BUY,
                OrderPricingType.LIMIT,
                new BigDecimal("50.00"),
                100L,
                null,
                ACCOUNT_ID,
                INSTRUMENT_ID);

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(account));
        when(instrumentMapper.selectInstrumentByTicker("ACME"))
                .thenReturn(Optional.of(instrument));
        when(orderMapper.selectOrderByIdempotencyKey("idem-duplicate"))
                .thenReturn(Optional.of(duplicate));

        assertThrows(
                DuplicateOrderException.class,
                () -> tradeService.placeOrder(
                        ACCOUNT_ID,
                        "ACME",
                        OrderSide.BUY,
                        OrderPricingType.LIMIT,
                        100L,
                        new BigDecimal("50.00"),
                        "idem-duplicate"));

        verify(orderMapper, never()).insertOrder(any(Order.class));
        verify(orderPlacedAfterCommitListener, never()).onOrderPlaced(any());
    }

    @Test
    void cancellingAFilledOrderReturnsOrd409() {
        Order filledOrder = new Order(
                9001L,
                "idem-filled",
                OrderStatus.FILLED,
                OffsetDateTime.parse("2026-09-10T09:00:00Z"),
                OrderSide.BUY,
                OrderPricingType.LIMIT,
                new BigDecimal("50.00"),
                100L,
                OffsetDateTime.parse("2026-09-10T09:01:00Z"),
                ACCOUNT_ID,
                INSTRUMENT_ID);

        when(orderMapper.selectOrderById(9001L))
                .thenReturn(Optional.of(filledOrder));
        when(orderMapper.cancelOrder(9001L, 1L))
                .thenReturn(0);

        assertThrows(
                OrderNotCancellableException.class,
                () -> tradeService.cancelOrder(9001L, ACCOUNT_ID));
    }

    @Test
    void cancellingAnotherAccountsOrderReturnsAcc403() {
        Order otherAccountsOrder = new Order(
                9002L,
                "idem-other",
                OrderStatus.NEW,
                OffsetDateTime.parse("2026-09-10T09:00:00Z"),
                OrderSide.SELL,
                OrderPricingType.LIMIT,
                new BigDecimal("25.00"),
                20L,
                null,
                2,
                INSTRUMENT_ID);

        when(orderMapper.selectOrderById(9002L))
                .thenReturn(Optional.of(otherAccountsOrder));

        assertThrows(
                AccountNotActiveException.class,
                () -> tradeService.cancelOrder(9002L, ACCOUNT_ID));

        verify(orderMapper, never()).cancelOrder(eq(9002L), eq(1L));
    }

    private static Account activeAccount(
            BigDecimal balance,
            long version) {

        return new Account(
                ACCOUNT_ID,
                "ACC-000001",
                LocalDate.of(2024, 1, 1),
                balance,
                balance,
                AccountStatus.ACTIVE,
                "USD",
                version,
                null,
                null,
                11);
    }

    private static Instrument tradableInstrument() {
        return new Instrument(
                INSTRUMENT_ID,
                "ACME",
                "Acme Corp",
                InstrumentAssetClass.EQUITY,
                InstrumentStatus.TRADING);
    }
}

