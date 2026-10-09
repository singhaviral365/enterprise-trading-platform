package org.example.backend.signals;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.example.backend.signals.data.Candle;
import org.example.backend.signals.config.SignalProperties;
import org.example.backend.signals.service.SignalMetrics;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

/** Builders the signals tests share. */
public final class SignalTestSupport {

    public static final Instant NOW = Instant.parse("2026-10-07T10:00:00Z");

    private SignalTestSupport() {
    }

    public static Clock clockAt(Instant instant) {
        return Clock.fixed(instant, ZoneOffset.UTC);
    }

    /** Ten-minute candle cache, five-minute results, 60 requests a minute and 10 per account; a key and a model are set. */
    public static SignalProperties properties() {
        return properties("test-key", 60, 10);
    }

    public static SignalProperties properties(String apiKey, int rpm, int perAccountRpm) {
        return new SignalProperties(10, 24, 5, 90, apiKey, "gemini-test", "http://localhost:1", 2000, 400, rpm,
                perAccountRpm, 50);
    }

    public static SignalMetrics metrics() {
        return new SignalMetrics(new SimpleMeterRegistry());
    }

    /** {@code days} trading-day candles ending on {@code end}, closing at {@code start + step * i}. */
    public static List<Candle> candles(String symbol, int days, double start, double step, LocalDate end) {
        List<Candle> candles = new ArrayList<>();
        for (int i = 0; i < days; i++) {
            BigDecimal close = BigDecimal.valueOf(start + step * i);
            candles.add(new Candle(end.minusDays(days - 1L - i), close, false));
        }
        return candles;
    }
}
