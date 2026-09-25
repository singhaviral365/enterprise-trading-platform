package org.example.trade_executor.client;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Component
public class FauxnanceQuoteClient implements QuoteClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(FauxnanceQuoteClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI baseUri;
    private final int maxAttempts;
    private final long retryDelayMillis;
    private final Duration requestTimeout;
    private final String apiKey;

    @Autowired
    public FauxnanceQuoteClient(
            @Value("${trading.quote.base-url}") String baseUrl,
            @Value("${trading.quote.api-key:}") String apiKey,
            @Value("${trading.quote.max-attempts:3}") int maxAttempts,
            @Value("${trading.quote.retry-delay-millis:100}") long retryDelayMillis,
            @Value("${trading.quote.request-timeout-millis:1000}") long requestTimeoutMillis) {

        this(HttpClient.newBuilder()
                        .connectTimeout(Duration.ofMillis(requestTimeoutMillis))
                        .build(),
            new ObjectMapper(),
                URI.create(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"),
                apiKey,
                maxAttempts,
                retryDelayMillis,
                Duration.ofMillis(requestTimeoutMillis));
    }

    public FauxnanceQuoteClient(
            String baseUrl,
            int maxAttempts,
            long retryDelayMillis,
            long requestTimeoutMillis) {

        this(baseUrl, "", maxAttempts, retryDelayMillis, requestTimeoutMillis, new ObjectMapper());
        }

        FauxnanceQuoteClient(
            String baseUrl,
            String apiKey,
            int maxAttempts,
            long retryDelayMillis,
            long requestTimeoutMillis,
            ObjectMapper objectMapper) {

        this(HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(requestTimeoutMillis))
                .build(),
            objectMapper,
            URI.create(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"),
            apiKey,
            maxAttempts,
            retryDelayMillis,
            Duration.ofMillis(requestTimeoutMillis));
    }

    FauxnanceQuoteClient(
            HttpClient httpClient,
            ObjectMapper objectMapper,
            URI baseUri,
            String apiKey,
            int maxAttempts,
            long retryDelayMillis,
            Duration requestTimeout) {

        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.baseUri = baseUri;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.maxAttempts = Math.max(1, maxAttempts);
        this.retryDelayMillis = Math.max(0L, retryDelayMillis);
        this.requestTimeout = requestTimeout;
    }

    @Override
    public Optional<LiveQuote> getQuote(String symbol) {
        URI quoteUri = resolveQuoteUri(symbol);
        Map<String, LiveQuote> quotes = fetchQuotes(quoteUri, symbol);
        if (quotes.isEmpty()) {
            return Optional.empty();
        }

        LiveQuote quote = quotes.get(symbol);
        if (quote != null) {
            return Optional.of(quote);
        }

        return quotes.values().stream().findFirst();
    }

    @Override
    public Map<String, LiveQuote> getQuotes(Collection<String> symbols) {
        if (symbols == null) {
            return Map.of();
        }

        List<String> cleanSymbols = symbols.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .toList();

        if (cleanSymbols.isEmpty()) {
            return Map.of();
        }

        URI quoteUri = resolveBatchQuoteUri(cleanSymbols);
        return fetchQuotes(quoteUri, String.join(",", cleanSymbols));
    }

    private Map<String, LiveQuote> fetchQuotes(URI quoteUri, String symbolContext) {

        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(quoteUri)
            .timeout(requestTimeout)
            .GET();

        if (!apiKey.isEmpty()) {
            requestBuilder.header("X-Api-Key", apiKey);
        }

        HttpRequest request = requestBuilder.build();

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                HttpResponse<String> response = httpClient.send(
                        request,
                        HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() == 200) {
                    return parseQuotes(response.body());
                }

                if (response.statusCode() == 404 || response.statusCode() == 204) {
                    LOGGER.info("No quote available for symbols {} (HTTP {})", symbolContext, response.statusCode());
                    return Map.of();
                }

                if (isRetryable(response.statusCode()) && attempt < maxAttempts) {
                    LOGGER.warn(
                            "Retryable quote lookup failure for symbols {} at {} (HTTP {}, attempt {} of {})",
                            symbolContext,
                            quoteUri,
                            response.statusCode(),
                            attempt,
                            maxAttempts);
                    backoff(attempt);
                    continue;
                }

                LOGGER.error(
                    "Quote lookup failed for symbols {} at {} with HTTP {}",
                    symbolContext,
                    quoteUri,
                    response.statusCode());

                throw new QuoteUnavailableException(
                        symbolContext,
                        "Quote lookup failed with HTTP status " + response.statusCode());
            } catch (IOException ex) {
                if (attempt < maxAttempts) {
                    LOGGER.warn(
                            "I/O error during quote lookup for symbols {} at {} (attempt {} of {})",
                            symbolContext,
                            quoteUri,
                            attempt,
                            maxAttempts,
                            ex);
                    backoff(attempt);
                    continue;
                }

                LOGGER.error(
                    "Quote lookup failed after retries for symbols {} at {}",
                    symbolContext,
                    quoteUri,
                    ex);

                throw new QuoteUnavailableException(
                        symbolContext,
                        "Quote lookup failed after retries",
                        ex);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new QuoteUnavailableException(
                        symbolContext,
                        "Quote lookup interrupted",
                        ex);
            }
        }

        throw new QuoteUnavailableException(symbolContext, "Quote lookup failed after retries");
    }

    private Map<String, LiveQuote> parseQuotes(String body) throws IOException {
        if (body == null || body.isBlank()) {
            return Map.of();
        }

        JsonNode root = objectMapper.readTree(body);
        Map<String, LiveQuote> quotes = new LinkedHashMap<>();
        collectQuotes(root, quotes);
        return quotes;
    }

    private void collectQuotes(JsonNode node, Map<String, LiveQuote> quotes) {
        if (node == null || node.isNull()) {
            return;
        }

        if (node.isObject()) {
            JsonNode symbolNode = node.get("symbol");
            JsonNode priceNode = node.get("price");
            if (symbolNode != null && priceNode != null && symbolNode.isTextual()) {
                String symbol = symbolNode.asText().trim();
                BigDecimal price = extractPrice(priceNode);
                if (!symbol.isBlank() && price != null && price.compareTo(BigDecimal.ZERO) > 0) {
                    quotes.put(symbol, new LiveQuote(symbol, price));
                }
            }

            node.fields().forEachRemaining(entry -> collectQuotes(entry.getValue(), quotes));
            return;
        }

        if (node.isArray()) {
            node.forEach(child -> collectQuotes(child, quotes));
        }
    }

    private BigDecimal extractPrice(JsonNode priceNode) {
        if (priceNode == null || priceNode.isNull()) {
            return null;
        }
        if (priceNode.isNumber()) {
            return priceNode.decimalValue();
        }
        if (priceNode.isTextual()) {
            String value = priceNode.asText().trim();
            if (value.isEmpty()) {
                return null;
            }
            try {
                return new BigDecimal(value);
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return null;
    }

    private URI resolveQuoteUri(String symbol) {
        String encodedSymbol = URLEncoder.encode(symbol, StandardCharsets.UTF_8);
        return baseUri.resolve("quotes/" + encodedSymbol);
    }

    private URI resolveBatchQuoteUri(List<String> symbols) {
        String joinedSymbols = symbols.stream()
                .map(String::trim)
                .collect(Collectors.joining(","));
        String encodedSymbols = URLEncoder.encode(joinedSymbols, StandardCharsets.UTF_8);
        return baseUri.resolve("quotes?symbols=" + encodedSymbols);
    }

    private boolean isRetryable(int statusCode) {
        return statusCode == 408
                || statusCode == 425
                || statusCode == 429
                || statusCode == 500
                || statusCode == 502
                || statusCode == 503
                || statusCode == 504;
    }

    private void backoff(int attempt) {
        if (retryDelayMillis <= 0) {
            return;
        }

        long delay = retryDelayMillis * Math.max(1, attempt);
        try {
            Thread.sleep(delay);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new QuoteUnavailableException("unknown", "Quote retry interrupted", ex);
        }
    }

}



