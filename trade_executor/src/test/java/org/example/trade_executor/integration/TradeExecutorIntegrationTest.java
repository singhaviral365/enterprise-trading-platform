package org.example.trade_executor.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.example.backend.dto.kafka.KafkaEventEnvelope;
import org.example.backend.entities.Instrument;
import org.example.backend.entities.Order;
import org.example.backend.enums.*;
import org.example.backend.events.OrderPlacedMessage;
import org.example.trade_executor.client.FauxnanceQuoteClient;
import org.example.trade_executor.events.TradeEventProducer;
import org.example.trade_executor.executor.ExecutionOutcome;
import org.example.trade_executor.executor.ExecutionRejectReason;
import org.example.trade_executor.executor.FillDecisionEngine;
import org.example.trade_executor.executor.OrderPlacedConsumer;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.example.trade_executor.service.OrderSettlementService;
import org.example.trade_executor.service.TradeExecutorService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = TradeExecutorIntegrationTest.Config.class)
class TradeExecutorIntegrationTest {

    private static final ConcurrentMap<String, StubQuoteResponse> QUOTE_RESPONSES = new ConcurrentHashMap<>();
    private static final HttpServer QUOTE_SERVER = startQuoteServer();

    @jakarta.annotation.Resource
    private OrderPlacedConsumer orderPlacedConsumer;

    @jakarta.annotation.Resource
    private ObjectMapper objectMapper;

    @jakarta.annotation.Resource
    private OrderMapper orderMapper;

    @jakarta.annotation.Resource
    private InstrumentMapper instrumentMapper;

    @jakarta.annotation.Resource
    private OrderSettlementService orderSettlementService;

    @BeforeEach
    void setUp() {
        QUOTE_RESPONSES.clear();
        Mockito.reset(orderMapper, instrumentMapper, orderSettlementService);
    }

    @AfterAll
    static void stopServer() {
        QUOTE_SERVER.stop(0);
    }

    @Test
    void executorAgainstMockedQuoteSourceCoversFill() throws Exception {
        QUOTE_RESPONSES.put("ACME", StubQuoteResponse.json(200, "{\"symbol\":\"ACME\",\"price\":49.1256}"));
        Order order = order(OrderSide.BUY, OrderPricingType.LIMIT, new BigDecimal("50.00"));
        Instrument instrument = instrument("ACME", InstrumentStatus.TRADING);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));

        Acknowledgment acknowledgment = Mockito.mock(Acknowledgment.class);
        orderPlacedConsumer.consume(serializedEnvelope(), acknowledgment);

        ArgumentCaptor<ExecutionOutcome> outcomeCaptor = ArgumentCaptor.forClass(ExecutionOutcome.class);
        verify(orderSettlementService).settle(eq(1L), outcomeCaptor.capture());
        verify(acknowledgment).acknowledge();

        assertEquals(OrderStatus.FILLED, outcomeCaptor.getValue().status());
        assertEquals(new BigDecimal("49.1256"), outcomeCaptor.getValue().executionPrice());
    }

    @Test
    void executorAgainstMockedQuoteSourceCoversReject() throws Exception {
        QUOTE_RESPONSES.put("ACME", StubQuoteResponse.json(200, "{\"symbol\":\"ACME\",\"price\":55.0000}"));
        Order order = order(OrderSide.BUY, OrderPricingType.LIMIT, new BigDecimal("50.00"));
        Instrument instrument = instrument("ACME", InstrumentStatus.TRADING);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));

        Acknowledgment acknowledgment = Mockito.mock(Acknowledgment.class);
        orderPlacedConsumer.consume(serializedEnvelope(), acknowledgment);

        ArgumentCaptor<ExecutionOutcome> outcomeCaptor = ArgumentCaptor.forClass(ExecutionOutcome.class);
        verify(orderSettlementService).settle(eq(1L), outcomeCaptor.capture());
        verify(acknowledgment).acknowledge();

        assertEquals(OrderStatus.REJECTED, outcomeCaptor.getValue().status());
        assertEquals(ExecutionRejectReason.OUTSIDE_MARKETABLE_RANGE, outcomeCaptor.getValue().rejectReason());
    }

    @Test
    void executorAgainstMockedQuoteSourceCoversPricingUnavailable() throws Exception {
        QUOTE_RESPONSES.put("ACME", StubQuoteResponse.json(503, "{\"message\":\"temporarily unavailable\"}"));
        Order order = order(OrderSide.BUY, OrderPricingType.MARKET, null);
        Instrument instrument = instrument("ACME", InstrumentStatus.TRADING);

        when(orderMapper.selectOrderById(1L)).thenReturn(Optional.of(order));
        when(instrumentMapper.selectInstrumentById(101)).thenReturn(Optional.of(instrument));

        Acknowledgment acknowledgment = Mockito.mock(Acknowledgment.class);
        orderPlacedConsumer.consume(serializedEnvelope(), acknowledgment);

        ArgumentCaptor<ExecutionOutcome> outcomeCaptor = ArgumentCaptor.forClass(ExecutionOutcome.class);
        verify(orderSettlementService).settle(eq(1L), outcomeCaptor.capture());
        verify(acknowledgment).acknowledge();

        assertEquals(OrderStatus.REJECTED, outcomeCaptor.getValue().status());
        assertEquals(ExecutionRejectReason.PRICE_UNAVAILABLE, outcomeCaptor.getValue().rejectReason());
    }

    private String serializedEnvelope() throws Exception {
        KafkaEventEnvelope<OrderPlacedMessage> envelope = new KafkaEventEnvelope<>(
                "event-1",
                "ORDER_PLACED",
                "2026-09-17T10:00:00Z",
                "trade-api",
                1,
                new OrderPlacedMessage(
                        1L,
                        1,
                        "ACME",
                        OrderSide.BUY,
                        100L,
                        OffsetDateTime.parse("2026-09-17T10:00:00Z")));
        return objectMapper.writeValueAsString(envelope);
    }

    private static Order order(
            OrderSide side,
            OrderPricingType pricingType,
            BigDecimal price) {

        return new Order(
                1L,
                "idem-1",
                OrderStatus.NEW,
                OffsetDateTime.parse("2026-09-17T10:00:00Z"),
                side,
                pricingType,
                price,
                100L,
                null,
                1,
                101);
    }

    private static Instrument instrument(String ticker, InstrumentStatus status) {
        return new Instrument(
                101,
                ticker,
                "Acme Corp",
                InstrumentAssetClass.EQUITY,
                status);
    }

    private static HttpServer startQuoteServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
            server.createContext("/quotes", TradeExecutorIntegrationTest::handleQuoteRequest);
            server.start();
            return server;
        } catch (IOException ex) {
            throw new IllegalStateException("Unable to start quote test server", ex);
        }
    }

    private static void handleQuoteRequest(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String symbol = URLDecoder.decode(
                path.substring(path.lastIndexOf('/') + 1),
                StandardCharsets.UTF_8);

        StubQuoteResponse response = QUOTE_RESPONSES.getOrDefault(symbol, StubQuoteResponse.json(404, ""));
        byte[] body = response.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(response.statusCode(), body.length);

        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(body);
        }
    }

    @Configuration
    static class Config {
        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper().findAndRegisterModules();
        }

        @Bean
        OrderMapper orderMapper() {
            return Mockito.mock(OrderMapper.class);
        }

        @Bean
        InstrumentMapper instrumentMapper() {
            return Mockito.mock(InstrumentMapper.class);
        }

        @Bean
        OrderSettlementService orderSettlementService() {
            OrderSettlementService service = Mockito.mock(OrderSettlementService.class);
            Mockito.when(service.settle(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.any()))
                    .thenReturn(Optional.empty());
            return service;
        }

        @Bean
        TradeEventProducer tradeEventProducer() {
            return Mockito.mock(TradeEventProducer.class);
        }

        @Bean
        FauxnanceQuoteClient quoteClient(ObjectMapper objectMapper) {
            return new FauxnanceQuoteClient(
                    "http://localhost:" + QUOTE_SERVER.getAddress().getPort() + "/",
                    2,
                    1L,
                    250L);
        }

        @Bean
        FillDecisionEngine fillDecisionEngine() {
            return new FillDecisionEngine();
        }

        @Bean
        TradeExecutorService tradeExecutorService(
                OrderMapper orderMapper,
                InstrumentMapper instrumentMapper,
                FauxnanceQuoteClient quoteClient,
                FillDecisionEngine fillDecisionEngine,
                OrderSettlementService orderSettlementService,
                TradeEventProducer tradeEventProducer) {
            return new TradeExecutorService(
                    orderMapper,
                    instrumentMapper,
                    quoteClient,
                    fillDecisionEngine,
                    orderSettlementService,
                    tradeEventProducer,
                    3);
        }

        @Bean
        OrderPlacedConsumer orderPlacedConsumer(
                ObjectMapper objectMapper,
                TradeExecutorService tradeExecutorService) {
            return new OrderPlacedConsumer(
                    objectMapper,
                    tradeExecutorService,
                    "orders",
                    "trade-executor");
        }
    }

    private record StubQuoteResponse(int statusCode, String body) {
        private static StubQuoteResponse json(int statusCode, String body) {
            return new StubQuoteResponse(statusCode, body);
        }
    }
}



