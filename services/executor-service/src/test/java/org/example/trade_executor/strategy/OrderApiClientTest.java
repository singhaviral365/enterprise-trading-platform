package org.example.trade_executor.strategy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.enums.OrderSide;
import org.example.trade_executor.strategy.OrderApiClient.Duplicate;
import org.example.trade_executor.strategy.OrderApiClient.Placed;
import org.example.trade_executor.strategy.OrderApiClient.Refused;
import org.example.trade_executor.strategy.OrderApiClient.Result;
import org.example.trade_executor.strategy.OrderApiClient.Unavailable;
import org.example.trade_executor.strategy.model.RunnableStrategy;
import org.example.trade_executor.strategy.model.TriggerDirection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.Flow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Against a stubbed HttpClient: what goes on the wire, and how each answer is read. */
class OrderApiClientTest {

    private static final String TOKEN = "header.payload.signature-of-the-token";

    private final ObjectMapper mapper = new ObjectMapper();
    private HttpClient http;
    private OrderApiClient client;

    private final RunnableStrategy strategy = new RunnableStrategy(5001, 1001, 1004, 2001, "AAPL", "USD", OrderSide.BUY, 50,
            TriggerDirection.BELOW, new BigDecimal("150"), true, null, null, new BigDecimal("10000"), 200, 1, 3, 1, 0);

    @BeforeEach
    void setUp() {
        http = mock(HttpClient.class);
        client = new OrderApiClient(http, mapper, "http://orders.test:8081", Duration.ofSeconds(5));
    }

    @SuppressWarnings("unchecked")
    private void answers(int status, String body) throws IOException, InterruptedException {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    private HttpRequest sent() throws IOException, InterruptedException {
        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        return request.getValue();
    }

    private static String bodyOf(HttpRequest request) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                byte[] bytes = new byte[item.remaining()];
                item.get(bytes);
                out.writeBytes(bytes);
            }

            @Override
            public void onError(Throwable throwable) {
                throw new IllegalStateException(throwable);
            }

            @Override
            public void onComplete() {
            }
        });
        return out.toString(StandardCharsets.UTF_8);
    }

    @Test
    void postsAMarketOrderToTheOrderRouteWithTheTokenAndTheRunsKey() throws Exception {
        answers(200, "{\"orderId\":\"77\",\"status\":\"NEW\"}");

        client.placeMarketOrder(strategy, TOKEN);

        HttpRequest request = sent();
        assertEquals("POST", request.method());
        assertEquals("http://orders.test:8081/api/v1/orders", request.uri().toString());
        assertEquals("Bearer " + TOKEN, request.headers().firstValue("Authorization").orElseThrow());
        assertEquals("application/json", request.headers().firstValue("Content-Type").orElseThrow());
        JsonNode body = mapper.readTree(bodyOf(request));
        assertEquals(1001, body.get("accountId").asInt());
        assertEquals("AAPL", body.get("symbol").asText());
        assertEquals("BUY", body.get("side").asText());
        assertEquals("MARKET", body.get("orderPricingType").asText());
        assertEquals(50, body.get("quantity").asInt());
        assertEquals("strat-5001-2", body.get("idempotencyKey").asText());
        assertFalse(body.has("price"), "a market order carries no price");
    }

    @Test
    void theTokenIsInTheHeaderOnlyNeverInTheBodyOrTheUrl() throws Exception {
        answers(200, "{\"orderId\":\"77\"}");

        client.placeMarketOrder(strategy, TOKEN);

        HttpRequest request = sent();
        assertFalse(request.uri().toString().contains(TOKEN));
        assertFalse(bodyOf(request).contains(TOKEN));
    }

    @Test
    void aBaseUrlWithATrailingSlashIsTheSame() throws Exception {
        client = new OrderApiClient(http, mapper, "http://orders.test:8081/", Duration.ofSeconds(5));
        answers(200, "{\"orderId\":\"77\"}");

        client.placeMarketOrder(strategy, TOKEN);

        assertEquals("http://orders.test:8081/api/v1/orders", sent().uri().toString());
    }

    @Test
    void a200WithAnOrderIdIsAPlacedOrder() throws Exception {
        answers(200, "{\"orderId\":\"77\",\"status\":\"NEW\"}");

        assertEquals(new Placed(77), client.placeMarketOrder(strategy, TOKEN));
    }

    @Test
    void aNumericOrderIdIsReadToo() throws Exception {
        answers(200, "{\"orderId\":78}");

        assertEquals(new Placed(78), client.placeMarketOrder(strategy, TOKEN));
    }

    @Test
    void a200WithoutAUsableOrderIdIsNotTakenAsPlaced() throws Exception {
        for (String body : new String[] {"{}", "{\"orderId\":null}", "{\"orderId\":\"abc\"}", "{\"orderId\":\"0\"}", "not json", ""}) {
            answers(200, body);

            assertInstanceOf(Unavailable.class, client.interpret(strategy, 200, body), body);
        }
    }

    @Test
    void aDuplicateOrderIsReadAsAlreadyPlaced() {
        assertEquals(new Duplicate(), client.interpret(strategy, 409, "{\"errorCode\":\"ORD-409\",\"message\":\"Duplicate order\"}"));
    }

    @Test
    void aDifferent409IsARefusalNotADuplicate() {
        Result result = client.interpret(strategy, 409, "{\"errorCode\":\"ACC-409\",\"message\":\"x\"}");

        assertEquals(new Refused(409, "ACC-409"), result);
    }

    @Test
    void any4xxIsARefusalCarryingItsCode() {
        assertEquals(new Refused(400, "ORD-400"), client.interpret(strategy, 400, "{\"errorCode\":\"ORD-400\"}"));
        assertEquals(new Refused(403, "STR-403"), client.interpret(strategy, 403, "{\"errorCode\":\"STR-403\"}"));
        assertEquals(new Refused(401, "AUTH-401"), client.interpret(strategy, 401, "{\"errorCode\":\"AUTH-401\"}"));
        assertEquals(new Refused(422, null), client.interpret(strategy, 422, "not json"));
    }

    @Test
    void any5xxIsUnavailable() {
        assertEquals(new Unavailable("the order service answered HTTP 503"), client.interpret(strategy, 503, "<html/>"));
        assertEquals(new Unavailable("the order service answered HTTP 500"), client.interpret(strategy, 500, "{}"));
    }

    @Test
    void anUnreachableServiceIsUnavailableAndTheMessageCarriesNeitherTheTokenNorTheAddress() throws Exception {
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("connect to http://orders.test:8081 failed, header Bearer " + TOKEN));

        Result result = client.placeMarketOrder(strategy, TOKEN);

        assertEquals(new Unavailable("the order service could not be reached"), result);
        assertFalse(result.toString().contains(TOKEN));
        assertFalse(result.toString().contains("orders.test"));
    }

    @Test
    void withNoAddressConfiguredNothingIsSent() throws Exception {
        client = new OrderApiClient(http, mapper, "  ", Duration.ofSeconds(5));

        Result result = client.placeMarketOrder(strategy, TOKEN);

        assertInstanceOf(Unavailable.class, result);
        verify(http, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void aTimeoutIsSetOnTheRequest() throws Exception {
        answers(200, "{\"orderId\":\"1\"}");

        client.placeMarketOrder(strategy, TOKEN);

        assertTrue(sent().timeout().isPresent());
        assertEquals(Duration.ofSeconds(5), sent().timeout().get());
    }
}
