package org.example.trade_executor.strategy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.trade_executor.strategy.model.RunnableStrategy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Places a strategy's order the only way an order may be placed: {@code POST /api/v1/orders} on the order-service, with the
 * token {@link ExecutorTokenMinter} made for it. Nothing here writes to the database or to Kafka.
 *
 * <p>One attempt, no retry. The order carries a key that stays the same for the run, so repeating the call is safe, but the
 * decision to repeat belongs to the worker (it happens on the next quote, after the failure was counted), not to a loop here.
 * The token is passed in the header of the one request and never kept, logged or put in an error message.
 */
@Component
public class OrderApiClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(OrderApiClient.class);
    private static final String DUPLICATE_ORDER = "ORD-409";

    /** What the order route answered. */
    public sealed interface Result permits Placed, Duplicate, Refused, Unavailable {
    }

    /** 200: the order exists now. */
    public record Placed(long orderId) implements Result {
    }

    /** 409 ORD-409: an earlier attempt of this run already placed it. */
    public record Duplicate() implements Result {
    }

    /** A 4xx: the route refused the order (funds, holdings, tradability, the strategy gate, ...). */
    public record Refused(int status, String errorCode) implements Result {
    }

    /** The route could not be reached, timed out, or answered with a 5xx or something unreadable. */
    public record Unavailable(String detail) implements Result {
    }

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI ordersUri;
    private final Duration requestTimeout;

    @Autowired
    public OrderApiClient(
            ObjectMapper objectMapper,
            @Value("${strategy.order-api.base-url:http://localhost:8081}") String baseUrl,
            @Value("${strategy.order-api.connect-timeout-millis:2000}") long connectTimeoutMillis,
            @Value("${strategy.order-api.request-timeout-millis:5000}") long requestTimeoutMillis) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofMillis(Math.max(100, connectTimeoutMillis))).build(),
                objectMapper, baseUrl, Duration.ofMillis(Math.max(500, requestTimeoutMillis)));
    }

    OrderApiClient(HttpClient httpClient, ObjectMapper objectMapper, String baseUrl, Duration requestTimeout) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        String trimmed = baseUrl == null ? "" : baseUrl.trim();
        this.ordersUri = trimmed.isEmpty()
                ? null
                : URI.create((trimmed.endsWith("/") ? trimmed : trimmed + "/") + "api/v1/orders");
        this.requestTimeout = requestTimeout;
    }

    public Result placeMarketOrder(RunnableStrategy strategy, String token) {
        if (ordersUri == null) {
            return new Unavailable("the order-service address is not configured");
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("accountId", strategy.accountId());
        body.put("symbol", strategy.tickerSymbol());
        body.put("side", strategy.side().name());
        body.put("orderPricingType", "MARKET");
        body.put("quantity", strategy.quantity());
        body.put("idempotencyKey", strategy.orderKey());

        final String json;
        try {
            json = objectMapper.writeValueAsString(body);
        } catch (IOException ex) {
            return new Unavailable("the order could not be written");
        }

        HttpRequest request = HttpRequest.newBuilder(ordersUri)
                .timeout(requestTimeout)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        final HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            LOGGER.warn("The order route could not be reached for strategy {}: {}",
                    strategy.strategyId(), ex.getClass().getSimpleName());
            return new Unavailable("the order service could not be reached");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return new Unavailable("the call was interrupted");
        }

        return interpret(strategy, response.statusCode(), response.body());
    }

    Result interpret(RunnableStrategy strategy, int status, String body) {
        if (status == 200) {
            Long orderId = orderId(body);
            return orderId == null ? new Unavailable("the order route answered without an order id") : new Placed(orderId);
        }
        if (status >= 500) {
            return new Unavailable("the order service answered HTTP " + status);
        }
        String errorCode = errorCode(body);
        if (status == 409 && DUPLICATE_ORDER.equals(errorCode)) {
            return new Duplicate();
        }
        LOGGER.info("The order route refused the order of strategy {}: HTTP {} {}", strategy.strategyId(), status, errorCode);
        return new Refused(status, errorCode);
    }

    private Long orderId(String body) {
        try {
            JsonNode node = objectMapper.readTree(body);
            JsonNode id = node == null ? null : node.get("orderId");
            if (id == null || id.isNull()) {
                return null;
            }
            long value = id.isNumber() ? id.asLong() : Long.parseLong(id.asText().trim());
            return value > 0 ? value : null;
        } catch (IOException | NumberFormatException ex) {
            return null;
        }
    }

    private String errorCode(String body) {
        try {
            JsonNode node = objectMapper.readTree(body);
            JsonNode code = node == null ? null : node.get("errorCode");
            return code == null || code.isNull() ? null : code.asText();
        } catch (IOException ex) {
            return null;
        }
    }
}
