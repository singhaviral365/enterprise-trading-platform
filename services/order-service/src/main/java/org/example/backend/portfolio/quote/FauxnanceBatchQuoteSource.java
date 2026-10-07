package org.example.backend.portfolio.quote;

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
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Fauxnance's batch quote endpoint, {@code GET /quotes?symbols=A,B,C}, from the order-service. The key is an
 * environment value of this service and never leaves it: no route returns it and the browser never calls Fauxnance.
 *
 * <p>One attempt per call, no retry loop. The caller ({@link QuoteCache}) already serves the last good quote when a call
 * fails, so retrying here would only spend quota and hold a request thread.
 */
@Component
public class FauxnanceBatchQuoteSource implements QuoteSource {

    private static final Duration USAGE_REFRESH = Duration.ofMinutes(10);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI baseUri;
    private final String apiKey;
    private final Duration requestTimeout;
    private final Clock clock;

    private volatile Integer cachedQuota;
    private volatile Instant quotaCheckedAt = Instant.EPOCH;

    @Autowired
    public FauxnanceBatchQuoteSource(
            @Value("${portfolio.quote.base-url:}") String baseUrl,
            @Value("${portfolio.quote.api-key:}") String apiKey,
            @Value("${portfolio.quote.request-timeout-millis:3000}") long requestTimeoutMillis) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofMillis(requestTimeoutMillis)).build(),
                new ObjectMapper(),
                baseUrl,
                apiKey,
                Duration.ofMillis(requestTimeoutMillis),
                Clock.systemUTC());
    }

    FauxnanceBatchQuoteSource(
            HttpClient httpClient,
            ObjectMapper objectMapper,
            String baseUrl,
            String apiKey,
            Duration requestTimeout,
            Clock clock) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        String trimmed = baseUrl == null ? "" : baseUrl.trim();
        this.baseUri = trimmed.isEmpty() ? null : URI.create(trimmed.endsWith("/") ? trimmed : trimmed + "/");
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.requestTimeout = requestTimeout;
        this.clock = clock;
    }

    @Override
    public Map<String, Quote> fetch(Collection<String> symbols) {
        if (symbols == null || symbols.isEmpty()) {
            return Map.of();
        }
        if (baseUri == null) {
            throw new QuoteSourceException("Fauxnance is not configured (portfolio.quote.base-url)", false);
        }

        String joined = String.join(",", symbols);
        URI uri = baseUri.resolve("quotes?symbols=" + URLEncoder.encode(joined, StandardCharsets.UTF_8));
        HttpResponse<String> response = get(uri);

        int status = response.statusCode();
        if (status == 200) {
            return parse(response.body());
        }
        if (status == 404 || status == 204) {
            return Map.of();
        }
        if (status == 429) {
            throw new QuoteSourceException("Fauxnance daily quota exhausted", true);
        }
        throw new QuoteSourceException("Fauxnance answered HTTP " + status, false);
    }

    @Override
    public Integer remainingQuota() {
        if (baseUri == null) {
            return null;
        }
        Instant now = clock.instant();
        if (Duration.between(quotaCheckedAt, now).compareTo(USAGE_REFRESH) < 0) {
            return cachedQuota;
        }
        quotaCheckedAt = now;
        try {
            HttpResponse<String> response = get(baseUri.resolve("usage"));
            cachedQuota = response.statusCode() == 200 ? findRemaining(objectMapper.readTree(response.body())) : null;
        } catch (IOException | RuntimeException ex) {
            cachedQuota = null;
        }
        return cachedQuota;
    }

    private HttpResponse<String> get(URI uri) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(requestTimeout).GET();
        if (!apiKey.isEmpty()) {
            builder.header("X-Api-Key", apiKey);
        }
        try {
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            // The URL and the key stay out of the message: they would end up in logs.
            throw new QuoteSourceException("Fauxnance could not be reached", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new QuoteSourceException("Fauxnance call interrupted", ex);
        }
    }

    // ---------------------------------------------------------------- parsing

    Map<String, Quote> parse(String body) {
        if (body == null || body.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Quote> quotes = new LinkedHashMap<>();
            collect(objectMapper.readTree(body), quotes);
            return quotes;
        } catch (IOException ex) {
            throw new QuoteSourceException("Fauxnance answered something that is not JSON", ex);
        }
    }

    /**
     * Fauxnance wraps each quote as {@code {"symbol", "source", "stale", "quote": {...}}}, or
     * {@code {"symbol", "error": {...}}} for an unknown symbol (skipped). A bare {@code {"symbol", "price", ...}} is accepted too.
     */
    private void collect(JsonNode node, Map<String, Quote> quotes) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            node.forEach(child -> collect(child, quotes));
            return;
        }
        if (!node.isObject()) {
            return;
        }
        JsonNode inner = node.get("quote");
        if (inner != null && inner.isObject() && add(inner, node, quotes)) {
            return;
        }
        if (add(node, null, quotes)) {
            return;
        }
        node.fields().forEachRemaining(entry -> collect(entry.getValue(), quotes));
    }

    private boolean add(JsonNode quote, JsonNode wrapper, Map<String, Quote> quotes) {
        String symbol = text(quote, "symbol");
        if (symbol == null && wrapper != null) {
            symbol = text(wrapper, "symbol");
        }
        BigDecimal price = number(quote.get("price"));
        if (symbol == null || price == null || price.signum() <= 0) {
            return false;
        }

        String currency = text(quote, "currency");
        if (currency == null && wrapper != null) {
            currency = text(wrapper, "currency");
        }
        boolean stale = flag(quote, "stale") || (wrapper != null && flag(wrapper, "stale"));
        quotes.putIfAbsent(symbol.toUpperCase(), new Quote(
                symbol.toUpperCase(),
                price,
                currency == null ? null : currency.toUpperCase(),
                positive(number(quote.get("previousClose"))),
                instant(text(quote, "asOf")),
                stale));
        return true;
    }

    private static BigDecimal positive(BigDecimal value) {
        return value != null && value.signum() > 0 ? value : null;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            return null;
        }
        return value.asText().trim();
    }

    private static boolean flag(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.asBoolean(false);
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

    private static Instant instant(String value) {
        if (value == null) {
            return null;
        }
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (RuntimeException ex) {
            try {
                return Instant.parse(value);
            } catch (RuntimeException ignored) {
                return null;
            }
        }
    }

    /** The usage document's shape is not fixed here, so look for a field that says how much is left. */
    private static Integer findRemaining(JsonNode node) {
        if (node == null) {
            return null;
        }
        for (String field : List.of("quotaRemaining", "requestsRemaining", "remaining")) {
            JsonNode value = node.get(field);
            if (value != null && value.canConvertToInt()) {
                return value.asInt();
            }
        }
        if (node.isObject()) {
            for (JsonNode child : node) {
                Integer found = findRemaining(child);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }
}
