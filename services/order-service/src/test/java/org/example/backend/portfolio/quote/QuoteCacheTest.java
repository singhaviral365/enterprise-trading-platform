package org.example.backend.portfolio.quote;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QuoteCacheTest {

    private static final Instant T0 = Instant.parse("2026-10-07T12:00:00Z");

    /** A clock the test moves by hand. */
    private static final class MovableClock extends Clock {
        private Instant now = T0;

        void advance(Duration by) {
            now = now.plus(by);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    /** A quote source that records every call and can be told to fail. */
    private static final class FakeSource implements QuoteSource {
        final List<List<String>> calls = new ArrayList<>();
        final Map<String, Quote> known = new LinkedHashMap<>();
        QuoteSourceException failWith;
        Instant asOf = T0;
        boolean stale;

        @Override
        public Map<String, Quote> fetch(Collection<String> symbols) {
            calls.add(new ArrayList<>(symbols));
            if (failWith != null) {
                throw failWith;
            }
            Map<String, Quote> answer = new LinkedHashMap<>();
            for (String symbol : symbols) {
                Quote quote = known.get(symbol);
                if (quote != null) {
                    answer.put(symbol, new Quote(symbol, quote.price(), quote.currency(), quote.previousClose(), asOf, stale));
                }
            }
            return answer;
        }
    }

    private MovableClock clock;
    private FakeSource source;
    private QuoteCache cache;

    @BeforeEach
    void setUp() {
        clock = new MovableClock();
        source = new FakeSource();
        source.known.put("AAPL", new Quote("AAPL", new BigDecimal("232.71"), "USD", new BigDecimal("230.00"), null, false));
        source.known.put("GOOGL", new Quote("GOOGL", new BigDecimal("346.47"), "USD", null, null, false));
        cache = new QuoteCache(source, Duration.ofSeconds(30), Duration.ofSeconds(300), Duration.ofHours(24),
                Duration.ofSeconds(60), 25, clock);
    }

    @Test
    void reusesAQuoteWithinTheWindow() {
        cache.lookup(List.of("AAPL"));
        clock.advance(Duration.ofSeconds(10));
        var second = cache.lookup(List.of("AAPL"));

        assertEquals(1, source.calls.size(), "the second lookup is inside the window: no call");
        assertEquals(new BigDecimal("232.71"), second.get("AAPL").quote().price());
        assertFalse(second.get("AAPL").stale());
    }

    @Test
    void asksAgainOnceTheWindowHasPassed() {
        cache.lookup(List.of("AAPL"));
        clock.advance(Duration.ofSeconds(31));
        cache.lookup(List.of("AAPL"));

        assertEquals(2, source.calls.size());
    }

    @Test
    void tenHoldingsAreOneCallAndThirtyAreTwo() {
        List<String> ten = IntStream.rangeClosed(1, 10).mapToObj(i -> "S" + i).toList();
        ten.forEach(s -> source.known.put(s, new Quote(s, BigDecimal.TEN, "USD", null, null, false)));
        cache.lookup(ten);
        assertEquals(1, source.calls.size(), "a per-position loop would be ten calls");
        assertEquals(10, source.calls.get(0).size());

        source.calls.clear();
        List<String> thirty = IntStream.rangeClosed(1, 30).mapToObj(i -> "T" + i).toList();
        thirty.forEach(s -> source.known.put(s, new Quote(s, BigDecimal.TEN, "USD", null, null, false)));
        cache.lookup(thirty);
        assertEquals(2, source.calls.size());
        assertEquals(25, source.calls.get(0).size(), "at most 25 symbols per call");
        assertEquals(5, source.calls.get(1).size());
    }

    @Test
    void onlyWhatIsMissingIsFetched() {
        cache.lookup(List.of("AAPL"));
        source.calls.clear();
        cache.lookup(List.of("AAPL", "GOOGL"));

        assertEquals(List.of(List.of("GOOGL")), source.calls);
    }

    @Test
    void symbolsAreNormalisedToUpperCase() {
        var result = cache.lookup(List.of("aapl", " AAPL "));

        assertEquals(1, source.calls.size());
        assertEquals(List.of("AAPL"), source.calls.get(0));
        assertNotNull(result.get("AAPL"));
    }

    @Test
    void whenARefreshFailsTheLastQuoteIsStillServedAndMarkedStale() {
        cache.lookup(List.of("AAPL"));
        clock.advance(Duration.ofSeconds(31));
        source.failWith = new QuoteSourceException("down", false);

        var result = cache.lookup(List.of("AAPL"));

        assertEquals(new BigDecimal("232.71"), result.get("AAPL").quote().price(), "stale is a state, not an error");
        assertTrue(result.get("AAPL").stale());
        assertEquals(QuoteCache.Outcome.FAILED, cache.lastOutcome());
    }

    @Test
    void withNothingCachedAndTheSourceDownThereIsNoQuoteAtAll() {
        source.failWith = new QuoteSourceException("down", false);

        assertTrue(cache.lookup(List.of("AAPL")).isEmpty());
    }

    @Test
    void aQuotaErrorOpensABackOffSoRefreshesDoNotHammerTheVendor() {
        source.failWith = new QuoteSourceException("quota", true);
        cache.lookup(List.of("AAPL"));
        assertEquals(QuoteCache.Outcome.QUOTA_EXHAUSTED, cache.lastOutcome());

        clock.advance(Duration.ofSeconds(20));
        cache.lookup(List.of("AAPL"));
        assertEquals(1, source.calls.size(), "inside the back-off: no call");

        clock.advance(Duration.ofSeconds(41));
        source.failWith = null;
        var result = cache.lookup(List.of("AAPL"));
        assertEquals(2, source.calls.size());
        assertNotNull(result.get("AAPL"));
    }

    @Test
    void aSymbolTheVendorDoesNotKnowIsAskedAboutOncePerWindowNotOncePerRefresh() {
        cache.lookup(List.of("NOPE"));
        cache.lookup(List.of("NOPE"));
        assertEquals(1, source.calls.size());

        clock.advance(Duration.ofSeconds(31));
        cache.lookup(List.of("NOPE"));
        assertEquals(2, source.calls.size());
    }

    @Test
    void aQuoteObservedLongAgoIsStaleEvenThoughItWasJustFetched() {
        source.asOf = T0.minusSeconds(900);

        var result = cache.lookup(List.of("AAPL"));

        assertTrue(result.get("AAPL").stale(), "delayed quotes are normal, and they are marked");
        assertEquals(T0.minusSeconds(900), result.get("AAPL").observedAt(), "the observation time is the quote's own");
    }

    @Test
    void aQuoteTheVendorFlagsStaleIsStale() {
        source.stale = true;

        assertTrue(cache.lookup(List.of("AAPL")).get("AAPL").stale());
    }

    @Test
    void aFreshQuoteIsNotStale() {
        var observed = cache.lookup(List.of("AAPL")).get("AAPL");

        assertFalse(observed.stale());
        assertEquals(T0, observed.observedAt());
    }

    @Test
    void whenAQuoteDoesNotSayWhenItWasObservedTheFetchTimeIsUsed() {
        source.asOf = null;

        assertEquals(T0, cache.lookup(List.of("AAPL")).get("AAPL").observedAt());
    }

    @Test
    void aQuoteOlderThanTheStaleLimitIsDropped() {
        cache.lookup(List.of("AAPL"));
        clock.advance(Duration.ofHours(25));
        source.failWith = new QuoteSourceException("down", false);

        assertTrue(cache.lookup(List.of("AAPL")).isEmpty());
    }

    @Test
    void concurrentRequestsForTheSameSymbolsMakeOneCall() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        QuoteSource slow = symbols -> {
            calls.incrementAndGet();
            try {
                Thread.sleep(150);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
            return Map.of("AAPL", new Quote("AAPL", BigDecimal.TEN, "USD", null, T0, false));
        };
        QuoteCache shared = new QuoteCache(slow, Duration.ofSeconds(30), Duration.ofSeconds(300), Duration.ofHours(24),
                Duration.ofSeconds(60), 25, clock);

        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<java.util.concurrent.Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                start.await();
                return shared.lookup(List.of("AAPL"));
            }));
        }
        start.countDown();
        for (var future : futures) {
            future.get(5, TimeUnit.SECONDS);
        }
        pool.shutdownNow();

        assertEquals(1, calls.get(), "single flight: the others waited and read the cache");
    }
}
