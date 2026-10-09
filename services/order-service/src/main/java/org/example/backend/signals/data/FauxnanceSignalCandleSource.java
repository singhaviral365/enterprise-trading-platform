package org.example.backend.signals.data;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Fauxnance's {@code GET /candles/{symbol}?from=&to=&interval=1d}: one row per day, with the {@code close} and a
 * {@code synthetic} flag for a day the market was closed. The key is an environment value of this service and is sent as a header;
 * error messages never contain the URL or the key.
 *
 * <p>One attempt per call, no retry loop: the cache in front of it holds the answer for minutes, and a retry would only spend the
 * daily quota the quote poller and the portfolio job share.
 */
@Component
public class FauxnanceSignalCandleSource implements CandleSource {

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI baseUri;
    private final String apiKey;
    private final Duration requestTimeout;

    @Autowired
    public FauxnanceSignalCandleSource(
            @Value("${signals.fauxnance.base-url:}") String baseUrl,
            @Value("${signals.fauxnance.api-key:}") String apiKey,
            @Value("${signals.fauxnance.request-timeout-millis:5000}") long requestTimeoutMillis) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofMillis(Math.max(500, requestTimeoutMillis))).build(),
                new ObjectMapper(), baseUrl, apiKey, Duration.ofMillis(Math.max(1000, requestTimeoutMillis)));
    }

    FauxnanceSignalCandleSource(HttpClient httpClient, ObjectMapper objectMapper, String baseUrl, String apiKey, Duration requestTimeout) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        String trimmed = baseUrl == null ? "" : baseUrl.trim();
        this.baseUri = trimmed.isEmpty() ? null : URI.create(trimmed.endsWith("/") ? trimmed : trimmed + "/");
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.requestTimeout = requestTimeout;
    }

    @Override
    public List<Candle> fetch(String symbol, LocalDate from, LocalDate to) {
        if (baseUri == null) {
            throw new CandleSourceException("Fauxnance is not configured", CandleSourceException.Kind.FAILED);
        }
        if (to.isBefore(from)) {
            return List.of();
        }

        URI uri = baseUri.resolve("candles/" + URLEncoder.encode(symbol, StandardCharsets.UTF_8)
                + "?from=" + from + "&to=" + to + "&interval=1d");
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(requestTimeout).GET();
        if (!apiKey.isEmpty()) {
            builder.header("X-Api-Key", apiKey);
        }

        final HttpResponse<String> response;
        try {
            response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new CandleSourceException("Fauxnance could not be reached", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new CandleSourceException("The call to Fauxnance was interrupted", ex);
        }

        return switch (response.statusCode()) {
            case 200 -> parse(response.body());
            case 404, 204 -> List.of();
            case 429 -> throw new CandleSourceException("Fauxnance daily quota exhausted", CandleSourceException.Kind.QUOTA);
            default -> throw new CandleSourceException("Fauxnance answered HTTP " + response.statusCode(), CandleSourceException.Kind.FAILED);
        };
    }

    /** Reads {@code {"data": {"candles": [{date, close, synthetic}]}}}. A row without a date or a positive close is skipped. */
    List<Candle> parse(String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }
        final JsonNode root;
        try {
            root = objectMapper.readTree(body);
        } catch (IOException ex) {
            throw new CandleSourceException("Fauxnance answered something that is not JSON", ex);
        }
        if (root == null) {
            return List.of();
        }
        JsonNode rows = (root.has("data") ? root.get("data") : root).get("candles");
        if (rows == null || !rows.isArray()) {
            return List.of();
        }

        List<Candle> candles = new ArrayList<>(rows.size());
        for (JsonNode row : rows) {
            LocalDate date = date(row.get("date"));
            BigDecimal close = number(row.get("close"));
            if (date == null || close == null || close.signum() <= 0) {
                continue;
            }
            JsonNode synthetic = row.get("synthetic");
            candles.add(new Candle(date, close, synthetic != null && synthetic.asBoolean(false)));
        }
        return candles;
    }

    private static LocalDate date(JsonNode node) {
        if (node == null || !node.isTextual() || node.asText().isBlank()) {
            return null;
        }
        String value = node.asText().trim();
        try {
            return LocalDate.parse(value.length() > 10 ? value.substring(0, 10) : value);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private static BigDecimal number(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.decimalValue();
        }
        if (node.isTextual()) {
            try {
                return new BigDecimal(node.asText().trim());
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return null;
    }
}
