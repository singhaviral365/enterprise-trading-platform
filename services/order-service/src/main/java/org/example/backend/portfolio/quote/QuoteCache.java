package org.example.backend.portfolio.quote;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The one price cache for the whole service, and the reason a portfolio costs one quote call and not one per holding.
 *
 * <ul>
 *   <li><b>Batched:</b> what is missing or expired is fetched in as few calls as possible, at most
 *       {@code max-symbols-per-call} (25) symbols each. Ten holdings are one call; thirty are two.</li>
 *   <li><b>Cached:</b> a quote is reused for {@code ttl-seconds} by every account and every refresh, so a screen that
 *       polls every minute, or ten tabs, still make one call per window.</li>
 *   <li><b>Single-flight:</b> the lookup is serialised, so concurrent requests for the same symbols wait for one call
 *       and then read what it fetched, instead of each making their own.</li>
 *   <li><b>Stale-while-error:</b> when a call fails, the last good quote is kept and served (marked stale) for up to
 *       {@code max-stale-hours}. A quota error (429) also opens a back-off so a refresh loop cannot hammer the vendor.</li>
 * </ul>
 *
 * <p>A symbol with no quote at all (never fetched, or older than the stale limit) is simply absent from the result: the
 * caller reports that position as unpriced.
 */
@Component
public class QuoteCache {

    private static final Logger LOGGER = LoggerFactory.getLogger(QuoteCache.class);

    /** What the last call to the quote source did, for {@code /health}. */
    public enum Outcome { NEVER, OK, FAILED, QUOTA_EXHAUSTED }

    private record Entry(Quote quote, Instant fetchedAt) {
    }

    private final QuoteSource source;
    private final Duration ttl;
    private final Duration fresh;
    private final Duration maxStale;
    private final Duration backoff;
    private final int maxSymbolsPerCall;
    private final Clock clock;

    private final Map<String, Entry> entries = new HashMap<>();
    /** Symbols Fauxnance answered without a quote: not asked about again until the window passes, so one unknown symbol costs one call, not one per refresh. */
    private final Map<String, Instant> unknownSince = new HashMap<>();
    private Instant backoffUntil = Instant.EPOCH;
    private volatile Outcome lastOutcome = Outcome.NEVER;

    @Autowired
    public QuoteCache(
            QuoteSource source,
            @Value("${portfolio.quote.ttl-seconds:30}") long ttlSeconds,
            @Value("${portfolio.quote.fresh-seconds:300}") long freshSeconds,
            @Value("${portfolio.quote.max-stale-hours:24}") long maxStaleHours,
            @Value("${portfolio.quote.backoff-seconds:60}") long backoffSeconds,
            @Value("${portfolio.quote.max-symbols-per-call:25}") int maxSymbolsPerCall) {
        this(source, Duration.ofSeconds(ttlSeconds), Duration.ofSeconds(freshSeconds), Duration.ofHours(maxStaleHours),
                Duration.ofSeconds(backoffSeconds), maxSymbolsPerCall, Clock.systemUTC());
    }

    QuoteCache(
            QuoteSource source,
            Duration ttl,
            Duration fresh,
            Duration maxStale,
            Duration backoff,
            int maxSymbolsPerCall,
            Clock clock) {
        this.source = source;
        this.ttl = ttl;
        this.fresh = fresh;
        this.maxStale = maxStale;
        this.backoff = backoff;
        this.maxSymbolsPerCall = Math.max(1, Math.min(25, maxSymbolsPerCall));
        this.clock = clock;
    }

    /** Quotes for {@code symbols}, keyed by upper-case symbol. Never throws for a pricing problem. */
    public synchronized Map<String, ObservedQuote> lookup(java.util.Collection<String> symbols) {
        Set<String> wanted = new LinkedHashSet<>();
        for (String symbol : symbols) {
            if (symbol != null && !symbol.isBlank()) {
                wanted.add(symbol.trim().toUpperCase(Locale.ROOT));
            }
        }

        Instant now = clock.instant();
        refresh(wanted, now);

        Map<String, ObservedQuote> result = new LinkedHashMap<>();
        for (String symbol : wanted) {
            Entry entry = entries.get(symbol);
            if (entry == null || Duration.between(entry.fetchedAt(), now).compareTo(maxStale) > 0) {
                continue;
            }
            Quote quote = entry.quote();
            Instant observedAt = quote.asOf() != null ? quote.asOf() : entry.fetchedAt();
            boolean keptAfterFailedRefresh = Duration.between(entry.fetchedAt(), now).compareTo(ttl) >= 0;
            boolean old = Duration.between(observedAt, now).compareTo(fresh) > 0;
            result.put(symbol, new ObservedQuote(quote, observedAt, quote.stale() || old || keptAfterFailedRefresh));
        }
        return result;
    }

    /** The outcome of the last call to the source, and the quota it reports, for {@code /health}. */
    public Outcome lastOutcome() {
        return lastOutcome;
    }

    public Integer remainingQuota() {
        return source.remainingQuota();
    }

    private void refresh(Set<String> wanted, Instant now) {
        List<String> missing = new ArrayList<>();
        for (String symbol : wanted) {
            Entry entry = entries.get(symbol);
            if (entry == null || Duration.between(entry.fetchedAt(), now).compareTo(ttl) >= 0) {
                Instant unknown = unknownSince.get(symbol);
                if (entry == null && unknown != null && Duration.between(unknown, now).compareTo(ttl) < 0) {
                    continue;
                }
                missing.add(symbol);
            }
        }
        if (missing.isEmpty()) {
            return;
        }
        if (now.isBefore(backoffUntil)) {
            return;
        }

        for (int start = 0; start < missing.size(); start += maxSymbolsPerCall) {
            List<String> batch = missing.subList(start, Math.min(missing.size(), start + maxSymbolsPerCall));
            try {
                Map<String, Quote> fetched = source.fetch(batch);
                for (Map.Entry<String, Quote> quote : fetched.entrySet()) {
                    entries.put(quote.getKey().toUpperCase(Locale.ROOT), new Entry(quote.getValue(), now));
                }
                for (String symbol : batch) {
                    if (fetched.containsKey(symbol)) {
                        unknownSince.remove(symbol);
                    } else {
                        unknownSince.put(symbol, now);
                    }
                }
                lastOutcome = Outcome.OK;
            } catch (QuoteSourceException ex) {
                // Keep what is cached: it is served stale. Stop at the first failure; the next call would fail too.
                lastOutcome = ex.isQuotaExceeded() ? Outcome.QUOTA_EXHAUSTED : Outcome.FAILED;
                if (ex.isQuotaExceeded()) {
                    backoffUntil = now.plus(backoff);
                }
                LOGGER.warn("Quote refresh failed ({}); serving the last known quotes where there are any", ex.getMessage());
                return;
            }
        }
    }
}
