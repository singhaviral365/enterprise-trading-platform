package org.example.backend.signals.service;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * The counters the signals module keeps, readable under {@code /actuator/metrics} (exposed in the development profile). All
 * are counts or timings: nothing about a customer or their holdings is ever a tag.
 *
 * <ul>
 *   <li>{@code signals.candle.cache} (result=hit|miss|stale) and {@code signals.candle.fetch} (outcome=ok|quota|failed);</li>
 *   <li>{@code signals.result.cache} (result=hit|miss);</li>
 *   <li>{@code signals.gemini.calls} (outcome=ok|failed|rate_limited|not_configured), {@code signals.gemini.tokens}
 *       (type=prompt|output) and the timer {@code signals.gemini.latency}.</li>
 * </ul>
 */
@Component
public class SignalMetrics {

    private final MeterRegistry registry;

    public SignalMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void candleCache(String result) {
        registry.counter("signals.candle.cache", "result", result).increment();
    }

    public void candleFetch(String outcome) {
        registry.counter("signals.candle.fetch", "outcome", outcome).increment();
    }

    public void resultCache(String result) {
        registry.counter("signals.result.cache", "result", result).increment();
    }

    public void geminiCall(String outcome) {
        registry.counter("signals.gemini.calls", "outcome", outcome).increment();
    }

    public void geminiTokens(int promptTokens, int outputTokens) {
        registry.counter("signals.gemini.tokens", "type", "prompt").increment(Math.max(0, promptTokens));
        registry.counter("signals.gemini.tokens", "type", "output").increment(Math.max(0, outputTokens));
    }

    public void geminiLatency(Duration latency) {
        registry.timer("signals.gemini.latency").record(latency);
    }
}
