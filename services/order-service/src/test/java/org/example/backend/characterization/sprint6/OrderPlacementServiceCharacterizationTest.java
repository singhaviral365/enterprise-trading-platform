package org.example.backend.characterization.sprint6;

import org.example.backend.dto.OrderResponse;
import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.entities.Instrument;
import org.example.backend.entities.Order;
import org.example.backend.events.OrderPlacedAfterCommitListener;
import org.example.backend.events.OrderPlacedEvent;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.DuplicateOrderException;
import org.example.backend.exceptions.InsufficientFundsException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.example.backend.service.TradeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderPlacementServiceCharacterizationTest {

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
    void acceptedAffordableOrderWritesCurrentCashPositionAndOrderValues() {
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

        ArgumentCaptor<Order> orderCaptor =
                ArgumentCaptor.forClass(Order.class);

        verify(orderMapper).insertOrder(orderCaptor.capture());
        verify(orderPlacedAfterCommitListener)
                .onOrderPlaced(any(OrderPlacedEvent.class));
        verify(accountMapper, never()).updateAccountBalanceWithVersion(any(Integer.class), any(BigDecimal.class), any(Long.class));
        verify(holdingMapper, never()).insertHolding(any(Holding.class));

        Order persistedOrder = orderCaptor.getValue();

        assertAll(
                () -> assertEquals("9001", response.orderId()),
                () -> assertEquals(OrderStatus.NEW, response.status()),
                () -> assertEquals("Order placed successfully", response.message()),
                () -> assertEquals("ACME", response.symbol()),
                () -> assertEquals(OrderSide.BUY, response.side()),
                () -> assertEquals(OrderPricingType.LIMIT, response.orderPricingType()),
                () -> assertEquals(100, response.quantity()),
                () -> assertEquals(new BigDecimal("50.0000"), response.price()),
                () -> assertEquals(9001L, persistedOrder.getOrderId()),
                () -> assertEquals("idem-commit", persistedOrder.getIdempotencyKey()),
                () -> assertEquals(OrderStatus.NEW, persistedOrder.getOrderStatus()),
                () -> assertNotNull(persistedOrder.getReceivedAt()),
                () -> assertEquals(OrderSide.BUY, persistedOrder.getOrderSide()),
                () -> assertEquals(OrderPricingType.LIMIT, persistedOrder.getPricingType()),
                () -> assertEquals(new BigDecimal("50.0000"), persistedOrder.getPrice()),
                () -> assertEquals(100L, persistedOrder.getQuantity()),
                () -> assertEquals(null, persistedOrder.getTransactionDate()),
                () -> assertEquals(ACCOUNT_ID, persistedOrder.getAccountId()),
                () -> assertEquals(INSTRUMENT_ID, persistedOrder.getInstrumentId()));
    }

    @Test
    void reusedIdempotencyKeyReturnsCurrentOrd409AndDoesNotWrite() {
        Account account = activeAccount(new BigDecimal("25000.00"), 3L);
        Instrument instrument = tradableInstrument();

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(account));
        when(instrumentMapper.selectInstrumentByTicker("ACME"))
                .thenReturn(Optional.of(instrument));
        when(orderMapper.selectOrderByIdempotencyKey("idem-duplicate"))
                .thenReturn(Optional.of(existingOrder("idem-duplicate")));

        DuplicateOrderException exception = assertThrows(
                DuplicateOrderException.class,
                () -> tradeService.placeOrder(
                        ACCOUNT_ID,
                        "ACME",
                        OrderSide.BUY,
                        OrderPricingType.LIMIT,
                        100L,
                        new BigDecimal("50.00"),
                        "idem-duplicate"));

        assertAll(
                () -> assertEquals("ORD-409", exception.getErrorCode()),
                () -> assertEquals("Duplicate order", exception.getMessage()),
                () -> assertEquals("idem-duplicate", exception.getIdempotencyKey()));

        verify(accountMapper, never()).updateAccountBalanceWithVersion(any(Integer.class), any(BigDecimal.class), any(Long.class));
        verify(holdingMapper, never()).insertHolding(any(Holding.class));
        verify(orderMapper, never()).insertOrder(any(Order.class));
        verify(orderPlacedAfterCommitListener, never()).onOrderPlaced(any(OrderPlacedEvent.class));
    }

    @Test
    void acceptedBuyNoLongerPerformsSynchronousAffordabilityCheck() {
        Account account = activeAccount(new BigDecimal("4999.99"), 3L);
        Instrument instrument = tradableInstrument();

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(account));
        when(instrumentMapper.selectInstrumentByTicker("ACME"))
                .thenReturn(Optional.of(instrument));
        when(orderMapper.selectOrderByIdempotencyKey("idem-insufficient"))
                .thenReturn(Optional.empty());
        when(orderMapper.nextOrderId())
                .thenReturn(9100L);

        OrderResponse response = tradeService.placeOrder(
                ACCOUNT_ID,
                "ACME",
                OrderSide.BUY,
                OrderPricingType.LIMIT,
                100L,
                new BigDecimal("50.00"),
                "idem-insufficient");

        assertAll(
                () -> assertEquals("9100", response.orderId()),
                () -> assertEquals(OrderStatus.NEW, response.status()),
                () -> assertEquals("Order placed successfully", response.message()));

        verify(accountMapper, never()).updateAccountBalanceWithVersion(any(Integer.class), any(BigDecimal.class), any(Long.class));
        verify(holdingMapper, never()).insertHolding(any(Holding.class));
        verify(orderMapper).insertOrder(any(Order.class));
        verify(orderPlacedAfterCommitListener).onOrderPlaced(any(OrderPlacedEvent.class));
    }

    @Test
    void unknownSymbolReturnsCurrentIns404AndDoesNotWrite() {
        Account account = activeAccount(new BigDecimal("25000.00"), 3L);

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(account));
        when(instrumentMapper.selectInstrumentByTicker("UNKNOWN"))
                .thenReturn(Optional.empty());

        InstrumentNotFoundException exception = assertThrows(
                InstrumentNotFoundException.class,
                () -> tradeService.placeOrder(
                        ACCOUNT_ID,
                        "UNKNOWN",
                        OrderSide.BUY,
                        OrderPricingType.LIMIT,
                        100L,
                        new BigDecimal("50.00"),
                        "idem-unknown"));

        assertAll(
                () -> assertEquals("INS-404", exception.getErrorCode()),
                () -> assertEquals("Instrument not found", exception.getMessage()),
                () -> assertEquals("UNKNOWN", exception.getSymbol()));

        verify(accountMapper, never()).updateAccountBalanceWithVersion(any(Integer.class), any(BigDecimal.class), any(Long.class));
        verify(holdingMapper, never()).insertHolding(any(Holding.class));
        verify(orderMapper, never()).insertOrder(any(Order.class));
        verify(orderPlacedAfterCommitListener, never()).onOrderPlaced(any(OrderPlacedEvent.class));
    }

    @Test
    void inactiveAccountReturnsCurrentAcc403AndDoesNotWrite() {
        Account suspendedAccount = new Account(
                ACCOUNT_ID,
                "ACC-000001",
                LocalDate.of(2024, 1, 1),
                new BigDecimal("25000.00"),
                new BigDecimal("25000.00"),
                AccountStatus.SUSPENDED,
                "USD",
                3L,
                OffsetDateTime.parse("2026-09-10T09:00:00Z"),
                null,
                11);

        when(accountMapper.selectAccountById(ACCOUNT_ID))
                .thenReturn(Optional.of(suspendedAccount));

        AccountNotActiveException exception = assertThrows(
                AccountNotActiveException.class,
                () -> tradeService.placeOrder(
                        ACCOUNT_ID,
                        "ACME",
                        OrderSide.BUY,
                        OrderPricingType.LIMIT,
                        100L,
                        new BigDecimal("50.00"),
                        "idem-inactive"));

        assertAll(
                () -> assertEquals("ACC-403", exception.getErrorCode()),
                () -> assertEquals("Account not active", exception.getMessage()),
                () -> assertEquals(ACCOUNT_ID, exception.getAccountId()),
                () -> assertEquals(AccountStatus.SUSPENDED, exception.getStatus()));

        verify(accountMapper, never()).updateAccountBalanceWithVersion(any(Integer.class), any(BigDecimal.class), any(Long.class));
        verify(holdingMapper, never()).insertHolding(any(Holding.class));
        verify(orderMapper, never()).insertOrder(any(Order.class));
        verify(orderPlacedAfterCommitListener, never()).onOrderPlaced(any(OrderPlacedEvent.class));
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

    private static Order existingOrder(String idempotencyKey) {
        return new Order(
                9000L,
                idempotencyKey,
                OrderStatus.FILLED,
                OffsetDateTime.parse("2026-09-10T09:00:00Z"),
                OrderSide.BUY,
                OrderPricingType.LIMIT,
                new BigDecimal("50.00"),
                100L,
                OffsetDateTime.parse("2026-09-10T09:01:00Z"),
                ACCOUNT_ID,
                INSTRUMENT_ID);
    }
}

