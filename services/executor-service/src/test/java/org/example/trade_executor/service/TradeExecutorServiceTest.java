package org.example.trade_executor.service;

import org.example.backend.entities.Instrument;
import org.example.backend.entities.Order;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.events.OrderPlacedMessage;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.trade_executor.client.LiveQuote;
import org.example.trade_executor.client.QuoteClient;
import org.example.trade_executor.client.QuoteUnavailableException;
import org.example.trade_executor.events.OrderResolvedEvent;
import org.example.trade_executor.events.TradeEventProducer;
import org.example.trade_executor.executor.ExecutionOutcome;
import org.example.trade_executor.executor.ExecutionRejectReason;
import org.example.trade_executor.executor.FillDecisionEngine;
import org.example.trade_executor.executor.PoisonOrderMessageException;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TradeExecutorServiceTest {

    @Mock
    private OrderMapper orderMapper;

    @Mock
    private InstrumentMapper instrumentMapper;

    @Mock
    private QuoteClient quoteClient;

    @Mock
    private FillDecisionEngine fillDecisionEngine;

    @Mock
    private OrderSettlementService orderSettlementService;

    @Mock
    private TradeEventProducer tradeEventProducer;

    private TradeExecutorService tradeExecutorService;

    @BeforeEach
    void setUp() {
        tradeExecutorService = new TradeExecutorService(
                orderMapper,
                instrumentMapper,
                quoteClient,
                fillDecisionEngine,
                orderSettlementService,
                tradeEventProducer,
                3);
    }

    @Test
    void orderWithNoAvailablePriceIsResolvedRatherThanLeftNew() {
        Order order = order(OrderPricingType.MARKET, null);
        Instrument instrument = instrument();
        OrderPlacedMessage event = event();

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(quoteClient.getQuote("ACME")).thenReturn(Optional.empty());
        when(orderSettlementService.settle(
                1L,
                ExecutionOutcome.rejected(ExecutionRejectReason.PRICE_UNAVAILABLE))).thenReturn(Optional.empty());

        tradeExecutorService.execute(event);

        verify(orderSettlementService).settle(
                1L,
                ExecutionOutcome.rejected(ExecutionRejectReason.PRICE_UNAVAILABLE));
    }

    @Test
    void fauxnanceOutageBecomesRejectedBusinessOutcomeAfterRetriesAreSpent() {
        Order order = order(OrderPricingType.MARKET, null);
        Instrument instrument = instrument();
        OrderPlacedMessage event = event();

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(quoteClient.getQuote("ACME")).thenThrow(new QuoteUnavailableException("ACME", "downstream unavailable"));
        when(orderSettlementService.settle(
                1L,
                ExecutionOutcome.rejected(ExecutionRejectReason.PRICE_UNAVAILABLE))).thenReturn(Optional.empty());

        tradeExecutorService.execute(event);

        verify(orderSettlementService).settle(
                1L,
                ExecutionOutcome.rejected(ExecutionRejectReason.PRICE_UNAVAILABLE));
    }

    @Test
    void marketOrderUsesQuoteWithoutLimitChecks() {
        Order order = order(OrderPricingType.MARKET, null);
        Instrument instrument = instrument();
        OrderPlacedMessage event = event();
        LiveQuote quote = new LiveQuote("ACME", new BigDecimal("49.1256"));
        ExecutionOutcome outcome = ExecutionOutcome.filled(new BigDecimal("49.1256"));

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(quoteClient.getQuote("ACME")).thenReturn(Optional.of(quote));
        when(fillDecisionEngine.decide(order, quote)).thenReturn(outcome);
        when(orderSettlementService.settle(1L, outcome)).thenReturn(Optional.empty());

        tradeExecutorService.execute(event);

        verify(fillDecisionEngine).decide(order, quote);
        verify(orderSettlementService).settle(1L, outcome);
    }

    @Test
    void exhaustedOptimisticLockRetriesProduceError() {
        Order order = order(OrderPricingType.MARKET, null);
        Instrument instrument = instrument();
        OrderPlacedMessage event = event();
        LiveQuote quote = new LiveQuote("ACME", new BigDecimal("49.1256"));
        ExecutionOutcome outcome = ExecutionOutcome.filled(new BigDecimal("49.1256"));

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(quoteClient.getQuote("ACME")).thenReturn(Optional.of(quote));
        when(fillDecisionEngine.decide(order, quote)).thenReturn(outcome);
        when(orderSettlementService.settle(1L, outcome)).thenThrow(new OptimisticLockException());

        assertThrows(OptimisticLockException.class, () -> tradeExecutorService.execute(event));
        verify(orderSettlementService, times(3)).settle(1L, outcome);
    }

    @Test
    void successfulSettlementPublishesTradeEvent() {
        Order order = order(OrderPricingType.MARKET, null);
        Instrument instrument = instrument();
        OrderPlacedMessage event = event();
        LiveQuote quote = new LiveQuote("ACME", new BigDecimal("49.1256"));
        ExecutionOutcome outcome = ExecutionOutcome.filled(new BigDecimal("49.1256"));
        OrderResolvedEvent resolvedEvent = new OrderResolvedEvent(
                "ORDER_FILLED",
                1L,
                1,
                "ACME",
                OrderSide.BUY,
                100L,
                new BigDecimal("49.13"),
                null,
                OffsetDateTime.parse("2026-09-17T10:00:00Z"));

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));
        when(quoteClient.getQuote("ACME")).thenReturn(Optional.of(quote));
        when(fillDecisionEngine.decide(order, quote)).thenReturn(outcome);
        when(orderSettlementService.settle(1L, outcome)).thenReturn(Optional.of(resolvedEvent));

        tradeExecutorService.execute(event);

        verify(tradeEventProducer).publish(resolvedEvent);
    }

    @Test
    void instrumentNotTradableOrderDoesNotExecute() {
        Order order = order(OrderPricingType.MARKET, null);
        Instrument nonTradableInstrument = new Instrument(
                101,
                "ACME",
                "Acme Corp",
                InstrumentAssetClass.EQUITY,
                InstrumentStatus.HALTED);
        OrderPlacedMessage event = event();

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(nonTradableInstrument));
        when(orderSettlementService.settle(
                1L,
                ExecutionOutcome.rejected(ExecutionRejectReason.INSTRUMENT_NOT_TRADABLE))).thenReturn(Optional.empty());

        tradeExecutorService.execute(event);

        verify(quoteClient, never()).getQuote("ACME");
        verify(fillDecisionEngine, never()).decide(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(orderSettlementService).settle(
                1L,
                ExecutionOutcome.rejected(ExecutionRejectReason.INSTRUMENT_NOT_TRADABLE));
    }

    @Test
    void unknownOrderIdRaisesPoisonMessageError() {
        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.empty());

        assertThrows(PoisonOrderMessageException.class, () -> tradeExecutorService.execute(event()));
    }

    private static Order order(OrderPricingType pricingType, BigDecimal price) {
        return new Order(
                1L,
                "idem-1",
                OrderStatus.NEW,
                OffsetDateTime.parse("2026-09-17T09:15:30Z"),
                OrderSide.BUY,
                pricingType,
                price,
                100L,
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

    private static OrderPlacedMessage event() {
        return new OrderPlacedMessage(
                1L,
                1,
                "ACME",
                OrderSide.BUY,
                100L,
                OffsetDateTime.parse("2026-09-17T09:15:30Z"));
    }
}

