package org.example.trade_executor.market;

import org.example.trade_executor.client.PriceHistory;
import org.example.trade_executor.client.QuoteClient;
import org.example.trade_executor.client.QuoteUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * One year of daily closing prices for a symbol, up to today (UTC), from Fauxnance's /candles endpoint. Daily
 * candles change at most once a day, so each symbol's history is cached for a while to spare the upstream API.
 */
@Service
public class PriceHistoryService {

    static final String INTERVAL = "1d";

    private static final Logger LOGGER = LoggerFactory.getLogger(PriceHistoryService.class);
    /** Tickers, FX pairs and indices: letters, digits and . - _ : ^ = (e.g. BRK.B, FX:EURUSD, ^GSPC). */
    private static final Pattern SYMBOL = Pattern.compile("[A-Za-z0-9.\\-_:^=]{1,32}");

    private final QuoteClient quoteClient;
    private final Duration cacheTtl;
    private final Clock clock;
    private final Map<String, Snapshot> cache = new ConcurrentHashMap<>();

    @Autowired
    public PriceHistoryService(
            QuoteClient quoteClient,
            @Value("${trading.market.history-cache-ttl-seconds:900}") long cacheTtlSeconds) {

        this(quoteClient, cacheTtlSeconds, Clock.systemUTC());
    }

    PriceHistoryService(QuoteClient quoteClient, long cacheTtlSeconds, Clock clock) {
        this.quoteClient = quoteClient;
        this.cacheTtl = Duration.ofSeconds(Math.max(1L, cacheTtlSeconds));
        this.clock = clock;
    }

    public PriceHistory getLastYear(String rawSymbol) {
        String symbol = rawSymbol == null ? "" : rawSymbol.trim();
        if (!SYMBOL.matcher(symbol).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid symbol");
        }
        String key = symbol.toUpperCase();

        Instant now = clock.instant();
        Snapshot cached = cache.get(key);
        if (cached != null && Duration.between(cached.fetchedAt(), now).compareTo(cacheTtl) < 0) {
            return cached.history();
        }

        LocalDate to = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate from = to.minusYears(1);
        try {
            PriceHistory history = quoteClient.getCandles(key, from, to, INTERVAL);
            cache.put(key, new Snapshot(history, now));
            return history;
        } catch (QuoteUnavailableException ex) {
            LOGGER.warn("Price history lookup failed for {}", key, ex);
            if (cached != null) {
                return cached.history();
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Price history unavailable", ex);
        }
    }

    private record Snapshot(PriceHistory history, Instant fetchedAt) {
    }
}
