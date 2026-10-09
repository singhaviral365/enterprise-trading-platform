package org.example.backend.portfolio.performance;

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
 * Fauxnance's {@code GET /candles/{symbol}?from=&to=&interval=1d}: one row per trading day, with the raw {@code close}, the
 * restated {@code adjclose} and a {@code synthetic} flag. Same base URL and key as the quote source: the key is an
 * environment value of this service and never leaves it, and error messages never contain the URL or the key.
 *
 * <p>One attempt per call, no retry loop: the job is nightly and resumes where it stopped, so retrying here would only spend the
 * shared daily quota.
 */
@Component
public class FauxnanceCandleSource implements CandleSource {

    /** A call may cover at most ten years. */
    static final long MAX_SPAN_DAYS = 3650;

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI baseUri;
    private final String apiKey;
    private final Duration requestTimeout;

    @Autowired
    public FauxnanceCandleSource(
            @Value("${portfolio.quote.base-url:}") String baseUrl,
            @Value("${portfolio.quote.api-key:}") String apiKey,
            @Value("${portfolio.quote.request-timeout-millis:3000}") long requestTimeoutMillis) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofMillis(requestTimeoutMillis)).build(),
                new ObjectMapper(), baseUrl, apiKey, Duration.ofMillis(Math.max(requestTimeoutMillis, 10_000)));
    }

    FauxnanceCandleSource(HttpClient httpClient, ObjectMapper objectMapper, String baseUrl, String apiKey, Duration requestTimeout) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        String trimmed = baseUrl == null ? "" : baseUrl.trim();
        this.baseUri = trimmed.isEmpty() ? null : URI.create(trimmed.endsWith("/") ? trimmed : trimmed + "/");
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.requestTimeout = requestTimeout;
    }

    @Override
    public List<DailyCandle> fetch(String symbol, LocalDate from, LocalDate to) {
        if (baseUri == null) {
            throw new CandleSourceException("Fauxnance is not configured (portfolio.quote.base-url)", CandleSourceException.Kind.FAILED);
        }
        if (to.isBefore(from)) {
            return List.of();
        }
        if (from.plusDays(MAX_SPAN_DAYS).isBefore(to)) {
            from = to.minusDays(MAX_SPAN_DAYS);
        }

        URI uri = baseUri.resolve("candles/" + URLEncoder.encode(symbol, StandardCharsets.UTF_8)
                + "?from=" + from + "&to=" + to + "&interval=1d");
        HttpResponse<String> response = get(uri);

        return switch (response.statusCode()) {
            case 200 -> parse(symbol, response.body());
            case 404, 204 -> List.of();
            case 202 -> throw new CandleSourceException("Fauxnance is still preparing the history", CandleSourceException.Kind.NOT_READY);
            case 429 -> throw new CandleSourceException("Fauxnance daily quota exhausted", CandleSourceException.Kind.QUOTA);
            default -> throw new CandleSourceException("Fauxnance answered HTTP " + response.statusCode(), CandleSourceException.Kind.FAILED);
        };
    }

    private HttpResponse<String> get(URI uri) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(requestTimeout).GET();
        if (!apiKey.isEmpty()) {
            builder.header("X-Api-Key", apiKey);
        }
        try {
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new CandleSourceException("Fauxnance could not be reached", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new CandleSourceException("Fauxnance call interrupted", ex);
        }
    }

    /** Reads {@code {"data": {"symbol", "currency", "candles": [{date, close, adjclose, synthetic, ...}]}}}. A row without a date or a close is skipped. */
    List<DailyCandle> parse(String symbol, String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(body);
        } catch (IOException ex) {
            throw new CandleSourceException("Fauxnance answered something that is not JSON", ex);
        }
        JsonNode data = root.has("data") ? root.get("data") : root;
        JsonNode rows = data.get("candles");
        if (rows == null || !rows.isArray()) {
            return List.of();
        }

        String currency = text(data, "currency");
        List<DailyCandle> candles = new ArrayList<>(rows.size());
        for (JsonNode row : rows) {
            LocalDate date = date(text(row, "date"));
            BigDecimal close = number(row.get("close"));
            if (date == null || close == null || close.signum() <= 0) {
                continue;
            }
            BigDecimal adjclose = number(row.get("adjclose"));
            JsonNode synthetic = row.get("synthetic");
            candles.add(new DailyCandle(
                    symbol.toUpperCase(),
                    date,
                    close,
                    adjclose != null && adjclose.signum() > 0 ? adjclose : close,
                    currency == null ? null : currency.toUpperCase(),
                    synthetic != null && synthetic.asBoolean(false)));
        }
        return candles;
    }

    private static LocalDate date(String value) {
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(value.length() > 10 ? value.substring(0, 10) : value);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || !value.isTextual() || value.asText().isBlank() ? null : value.asText().trim();
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
