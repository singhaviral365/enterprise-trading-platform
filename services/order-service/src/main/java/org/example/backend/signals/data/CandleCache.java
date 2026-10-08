package org.example.backend.signals.data;

import org.example.backend.signals.config.SignalProperties;
import org.example.backend.signals.exceptions.SignalDataUnavailableException;
import org.example.backend.signals.service.SignalMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Daily closes for a symbol, from Fauxnance, held in memory for a few minutes. A daily candle changes at most once a day,
 * so every customer looking at the same instrument within the window shares one call.
 *
 * <p>If Fauxnance cannot be reached, or the quota is used up, the candles already held are served instead, however stale up
 * to a day old, marked stale so the screen can say so. With nothing held there is nothing to serve and the caller is told.
 *
 * <p>Held in memory only; a restart starts empty. Bounded, so a stream of symbols cannot grow it without limit.
 */
@Component
public class CandleCache {

    /** Candles for a symbol, when they were fetched, and whether they are older than they should be. */
    public record Candles(List<Candle> candles, Instant fetchedAt, boolean stale) {
        public Duration age(Instant now) {
            return Duration.between(fetchedAt, now);
        }
    }

    static final int MAX_ENTRIES = 500;

    private static final Logger LOGGER = LoggerFactory.getLogger(CandleCache.class);

    private final CandleSource source;
    private final SignalProperties properties;
    private final SignalMetrics metrics;
    private final Clock clock;
    private final Map<String, Candles> entries = new ConcurrentHashMap<>();

    @Autowired
    public CandleCache(CandleSource source, SignalProperties properties, SignalMetrics metrics) {
        this(source, properties, metrics, Clock.systemUTC());
    }

    CandleCache(CandleSource source, SignalProperties properties, SignalMetrics metrics, Clock clock) {
        this.source = source;
        this.properties = properties;
        this.metrics = metrics;
        this.clock = clock;
    }

    /**
     * @param lookbackDays calendar days of history to ask for, ending today (UTC)
     * @throws SignalDataUnavailableException if the source failed and nothing usable is held
     */
    public Candles get(String symbol, int lookbackDays) {
        String ticker = symbol.trim().toUpperCase(Locale.ROOT);
        String key = ticker + "|" + lookbackDays;
        Instant now = clock.instant();

        Candles held = entries.get(key);
        if (held != null && held.age(now).compareTo(properties.candleTtl()) < 0) {
            metrics.candleCache("hit");
            LOGGER.debug("Candle cache hit for {} (age {}s)", key, held.age(now).toSeconds());
            return new Candles(held.candles(), held.fetchedAt(), false);
        }

        LocalDate to = LocalDate.ofInstant(now, ZoneOffset.UTC);
        try {
            List<Candle> fetched = source.fetch(ticker, to.minusDays(lookbackDays), to);
            Candles fresh = new Candles(List.copyOf(fetched), now, false);
            store(key, fresh);
            metrics.candleCache("miss");
            metrics.candleFetch("ok");
            LOGGER.info("Candle cache miss for {}: fetched {} candles", key, fetched.size());
            return fresh;
        } catch (CandleSourceException ex) {
            metrics.candleFetch(ex.isQuotaExceeded() ? "quota" : "failed");
            if (held != null && held.age(now).compareTo(properties.candleMaxStale()) <= 0) {
                metrics.candleCache("stale");
                LOGGER.warn("Candles for {} could not be fetched ({}); serving what is held, {}s old",
                        key, ex.kind(), held.age(now).toSeconds());
                return new Candles(held.candles(), held.fetchedAt(), true);
            }
            LOGGER.warn("Candles for {} could not be fetched ({}) and none are held", key, ex.kind());
            throw new SignalDataUnavailableException();
        }
    }

    private void store(String key, Candles candles) {
        if (entries.size() >= MAX_ENTRIES && !entries.containsKey(key)) {
            entries.entrySet().stream()
                    .min(Map.Entry.comparingByValue(Comparator.comparing(Candles::fetchedAt)))
                    .ifPresent(oldest -> entries.remove(oldest.getKey()));
        }
        entries.put(key, candles);
    }
}
