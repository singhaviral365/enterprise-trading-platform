package org.example.trade_executor.fx;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Calls ExchangeRate-API's standard endpoint: {@code GET {baseUrl}/{apiKey}/latest/{base}}.
 *
 * <p>The API key is part of the URL, so the URL is never logged. Configuration:
 * {@code EXCHANGE_RATE_API_URL} (e.g. https://v6.exchangerate-api.com/v6) and {@code EXCHANGE_RATE_API_KEY}.
 */
@Component
public class ExchangeRateApiClient implements ExchangeRateClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(ExchangeRateApiClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String apiKey;
    private final Duration requestTimeout;
    private final Clock clock;

    @Autowired
    public ExchangeRateApiClient(
            @Value("${trading.fx.base-url}") String baseUrl,
            @Value("${trading.fx.api-key:}") String apiKey,
            @Value("${trading.fx.request-timeout-millis:3000}") long requestTimeoutMillis) {

        this(HttpClient.newBuilder().connectTimeout(Duration.ofMillis(requestTimeoutMillis)).build(),
                new ObjectMapper(),
                baseUrl,
                apiKey,
                Duration.ofMillis(requestTimeoutMillis),
                Clock.systemUTC());
    }

    ExchangeRateApiClient(
            HttpClient httpClient,
            ObjectMapper objectMapper,
            String baseUrl,
            String apiKey,
            Duration requestTimeout,
            Clock clock) {

        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl == null ? "" : baseUrl.replaceAll("/+$", "");
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.requestTimeout = requestTimeout;
        this.clock = clock;
    }

    @Override
    public ExchangeRates fetchLatest(String baseCode) {
        if (apiKey.isEmpty()) {
            throw new ExchangeRateUnavailableException("EXCHANGE_RATE_API_KEY is not configured");
        }

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/" + apiKey + "/latest/" + baseCode))
                .timeout(requestTimeout)
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return parse(baseCode, response.statusCode(), response.body());
        } catch (IOException ex) {
            // The message is deliberately generic: exception text from the HTTP client can contain the URL (and key).
            throw new ExchangeRateUnavailableException("Exchange rate lookup failed (I/O error)", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ExchangeRateUnavailableException("Exchange rate lookup interrupted", ex);
        }
    }

    private ExchangeRates parse(String baseCode, int statusCode, String body) {
        JsonNode root;
        try {
            root = body == null || body.isBlank() ? null : objectMapper.readTree(body);
        } catch (IOException ex) {
            throw new ExchangeRateUnavailableException(
                    "Exchange rate response was not valid JSON (HTTP " + statusCode + ")", ex);
        }

        if (root == null || !"success".equals(root.path("result").asText())) {
            // error-type is one of unsupported-code, malformed-request, invalid-key, inactive-account, quota-reached.
            String errorType = root == null ? "no-body" : root.path("error-type").asText("unknown");
            LOGGER.warn("ExchangeRate-API refused the request: {} (HTTP {})", errorType, statusCode);
            throw new ExchangeRateUnavailableException("Exchange rate service error: " + errorType);
        }

        JsonNode conversionRates = root.path("conversion_rates");
        if (!conversionRates.isObject() || conversionRates.isEmpty()) {
            throw new ExchangeRateUnavailableException("Exchange rate response had no conversion_rates");
        }

        Map<String, BigDecimal> rates = new LinkedHashMap<>();
        conversionRates.fields().forEachRemaining(entry -> {
            if (entry.getValue().isNumber() && entry.getValue().decimalValue().signum() > 0) {
                rates.put(entry.getKey().toUpperCase(), entry.getValue().decimalValue());
            }
        });

        String responseBase = root.path("base_code").asText(baseCode).toUpperCase();
        return new ExchangeRates(responseBase, rates, clock.instant());
    }
}
