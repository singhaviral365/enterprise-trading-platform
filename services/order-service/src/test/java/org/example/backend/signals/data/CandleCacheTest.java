package org.example.backend.signals.data;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.example.backend.signals.SignalTestSupport;
import org.example.backend.signals.exceptions.SignalDataUnavailableException;
import org.example.backend.signals.service.SignalMetrics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CandleCacheTest {

    private CandleSource source;
    private SimpleMeterRegistry registry;
    private final AtomicReference<Instant> now = new AtomicReference<>(SignalTestSupport.NOW);
    private CandleCache cache;

    private final List<Candle> candles = SignalTestSupport.candles("AAPL", 60, 100, 1, LocalDate.parse("2026-10-06"));

    @BeforeEach
    void setUp() {
        source = mock(CandleSource.class);
        registry = new SimpleMeterRegistry();
        Clock movable = new Clock() {
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
                return now.get();
            }
        };
        cache = new CandleCache(source, SignalTestSupport.properties(), new SignalMetrics(registry), movable);
    }

    private double count(String name, String tag, String value) {
        var counter = registry.find(name).tag(tag, value).counter();
        return counter == null ? 0 : counter.count();
    }

    @Test
    void theFirstCallFetchesAndTheNextWithinTheWindowDoesNot() {
        when(source.fetch(eq("AAPL"), any(), any())).thenReturn(candles);

        CandleCache.Candles first = cache.get("aapl", 90);
        now.set(now.get().plus(Duration.ofMinutes(9)));
        CandleCache.Candles second = cache.get("AAPL", 90);

        verify(source, times(1)).fetch(eq("AAPL"), any(), any());
        assertEquals(candles, first.candles());
        assertEquals(candles, second.candles());
        assertFalse(second.stale());
        assertEquals(1, count("signals.candle.cache", "result", "miss"));
        assertEquals(1, count("signals.candle.cache", "result", "hit"));
    }

    @Test
    void afterTheWindowItFetchesAgain() {
        when(source.fetch(eq("AAPL"), any(), any())).thenReturn(candles);

        cache.get("AAPL", 90);
        now.set(now.get().plus(Duration.ofMinutes(11)));
        cache.get("AAPL", 90);

        verify(source, times(2)).fetch(eq("AAPL"), any(), any());
    }

    @Test
    void theWindowEndsTodayAndStartsTheRequestedDaysBack() {
        when(source.fetch(any(), any(), any())).thenReturn(candles);

        cache.get("AAPL", 180);

        verify(source).fetch("AAPL", LocalDate.parse("2026-04-10"), LocalDate.parse("2026-10-07"));
    }

    @Test
    void differentLookbacksAreSeparateEntries() {
        when(source.fetch(any(), any(), any())).thenReturn(candles);

        cache.get("AAPL", 90);
        cache.get("AAPL", 365);

        verify(source, times(2)).fetch(any(), any(), any());
    }

    @Test
    void whenTheSourceFailsWhatIsHeldIsServedAndMarkedStale() {
        when(source.fetch(any(), any(), any()))
                .thenReturn(candles)
                .thenThrow(new CandleSourceException("down", CandleSourceException.Kind.FAILED));

        cache.get("AAPL", 90);
        now.set(now.get().plus(Duration.ofHours(2)));
        CandleCache.Candles served = cache.get("AAPL", 90);

        assertTrue(served.stale());
        assertEquals(candles, served.candles());
        assertEquals(1, count("signals.candle.cache", "result", "stale"));
        assertEquals(1, count("signals.candle.fetch", "outcome", "failed"));
    }

    @Test
    void anExhaustedQuotaIsCountedAsSuch() {
        when(source.fetch(any(), any(), any())).thenThrow(new CandleSourceException("quota", CandleSourceException.Kind.QUOTA));

        assertThrows(SignalDataUnavailableException.class, () -> cache.get("AAPL", 90));

        assertEquals(1, count("signals.candle.fetch", "outcome", "quota"));
    }

    @Test
    void withNothingHeldAFailureIsReportedNotInvented() {
        when(source.fetch(any(), any(), any())).thenThrow(new CandleSourceException("down", CandleSourceException.Kind.FAILED));

        SignalDataUnavailableException ex = assertThrows(SignalDataUnavailableException.class, () -> cache.get("AAPL", 90));

        assertEquals("SIG-503", ex.getErrorCode());
    }

    @Test
    void candlesOlderThanADayAreNotServedWhenTheSourceIsDown() {
        when(source.fetch(any(), any(), any()))
                .thenReturn(candles)
                .thenThrow(new CandleSourceException("down", CandleSourceException.Kind.FAILED));

        cache.get("AAPL", 90);
        now.set(now.get().plus(Duration.ofHours(25)));

        assertThrows(SignalDataUnavailableException.class, () -> cache.get("AAPL", 90));
    }
}
