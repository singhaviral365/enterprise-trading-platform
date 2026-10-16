package org.example.backend.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriUtils;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Market data for the browser, relayed from the executor-service. The browser only ever talks to the order-service
 * (through the frontend's own address), so the executor needs no public route of any kind. The executor's answer is
 * passed on untouched: same status, same JSON, so the frontend's market types do not change.
 *
 * <p>The request is authenticated by {@code ApiAuthenticationFilter} like every other {@code /api/v1/} route. Nothing
 * from the browser request is forwarded: the executor's market endpoints take no input but the symbol.
 */
@RestController
@RequestMapping("/api/v1/market")
public class MarketProxyController {

    private static final Logger logger = LoggerFactory.getLogger(MarketProxyController.class);

    private final HttpClient httpClient;
    private final URI baseUri;
    private final Duration requestTimeout;

    @Autowired
    public MarketProxyController(
            @Value("${market.executor.base-url}") String baseUrl,
            @Value("${market.executor.request-timeout-millis:10000}") long requestTimeoutMillis) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build(), baseUrl,
                Duration.ofMillis(requestTimeoutMillis));
    }

    MarketProxyController(HttpClient httpClient, String baseUrl, Duration requestTimeout) {
        this.httpClient = httpClient;
        this.baseUri = URI.create(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
        this.requestTimeout = requestTimeout;
    }

    @GetMapping("/quotes")
    public ResponseEntity<byte[]> quotes() {
        return relay("api/v1/market/quotes");
    }

    /** Daily candles for the past year, oldest first. */
    @GetMapping("/candles/{symbol}")
    public ResponseEntity<byte[]> candles(@PathVariable String symbol) {
        return relay("api/v1/market/candles/" + UriUtils.encodePathSegment(symbol, StandardCharsets.UTF_8));
    }

    private ResponseEntity<byte[]> relay(String path) {
        HttpRequest request = HttpRequest.newBuilder(baseUri.resolve(path))
                .timeout(requestTimeout)
                .header("Accept", MediaType.APPLICATION_JSON_VALUE)
                .GET()
                .build();
        try {
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            MediaType contentType = response.headers().firstValue("Content-Type")
                    .map(MediaType::parseMediaType)
                    .orElse(MediaType.APPLICATION_JSON);
            return ResponseEntity.status(response.statusCode()).contentType(contentType).body(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return unavailable(path, e);
        } catch (IOException | RuntimeException e) {
            return unavailable(path, e);
        }
    }

    /** 503 is a status the frontend already treats as "market data unavailable, keep trying". */
    private static ResponseEntity<byte[]> unavailable(String path, Exception cause) {
        logger.warn("Market data relay failed for {}: {}", path, cause.toString());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
}
