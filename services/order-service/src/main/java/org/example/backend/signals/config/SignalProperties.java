package org.example.backend.signals.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * What the signals module is configured with. The Gemini key is an environment value of this service: it is sent as a
 * request header, never put in a URL, and never logged or returned.
 */
@Component
public class SignalProperties {

    private final Duration candleTtl;
    private final Duration candleMaxStale;
    private final Duration signalTtl;
    private final int defaultLookbackDays;

    private final String geminiApiKey;
    private final String geminiModel;
    private final String geminiBaseUrl;
    private final Duration geminiTimeout;
    private final int geminiMaxOutputTokens;
    private final int rateLimitRpm;
    private final int rateLimitPerAccountRpm;
    private final int warnRpm;

    public SignalProperties(
            @Value("${signals.candles.cache-ttl-minutes:${CANDLE_CACHE_TTL_MINUTES:10}}") long candleTtlMinutes,
            @Value("${signals.candles.max-stale-hours:24}") long candleMaxStaleHours,
            @Value("${signals.cache-ttl-minutes:${SIGNAL_CACHE_TTL_MINUTES:5}}") long signalTtlMinutes,
            @Value("${signals.lookback-days:90}") int defaultLookbackDays,
            @Value("${gemini.api-key:${GEMINI_API_KEY:}}") String geminiApiKey,
            @Value("${gemini.model:${GEMINI_MODEL:gemini-2.5-flash}}") String geminiModel,
            @Value("${gemini.base-url:https://generativelanguage.googleapis.com}") String geminiBaseUrl,
            @Value("${gemini.timeout-millis:8000}") long geminiTimeoutMillis,
            @Value("${gemini.max-output-tokens:400}") int geminiMaxOutputTokens,
            @Value("${gemini.rate-limit-rpm:${GEMINI_RATE_LIMIT_RPM:60}}") int rateLimitRpm,
            @Value("${gemini.rate-limit-per-account-rpm:10}") int rateLimitPerAccountRpm,
            @Value("${gemini.warn-rpm:50}") int warnRpm) {
        this.candleTtl = Duration.ofMinutes(Math.max(1, candleTtlMinutes));
        this.candleMaxStale = Duration.ofHours(Math.max(1, candleMaxStaleHours));
        this.signalTtl = Duration.ofMinutes(Math.max(1, signalTtlMinutes));
        this.defaultLookbackDays = Math.max(60, defaultLookbackDays);
        this.geminiApiKey = geminiApiKey == null ? "" : geminiApiKey.trim();
        this.geminiModel = geminiModel == null ? "" : geminiModel.trim();
        this.geminiBaseUrl = geminiBaseUrl == null ? "" : geminiBaseUrl.trim();
        this.geminiTimeout = Duration.ofMillis(Math.max(1000, geminiTimeoutMillis));
        this.geminiMaxOutputTokens = Math.max(50, Math.min(geminiMaxOutputTokens, 2000));
        this.rateLimitRpm = Math.max(1, rateLimitRpm);
        this.rateLimitPerAccountRpm = Math.max(1, rateLimitPerAccountRpm);
        this.warnRpm = Math.max(1, warnRpm);
    }

    /** How long fetched candles are used without asking again. Daily candles change at most once a day. */
    public Duration candleTtl() {
        return candleTtl;
    }

    /** How old held candles may be and still be served when the source is down. */
    public Duration candleMaxStale() {
        return candleMaxStale;
    }

    public Duration signalTtl() {
        return signalTtl;
    }

    public int defaultLookbackDays() {
        return defaultLookbackDays;
    }

    public boolean geminiConfigured() {
        return !geminiApiKey.isEmpty() && !geminiModel.isEmpty() && !geminiBaseUrl.isEmpty();
    }

    public String geminiApiKey() {
        return geminiApiKey;
    }

    public String geminiModel() {
        return geminiModel;
    }

    public String geminiBaseUrl() {
        return geminiBaseUrl;
    }

    public Duration geminiTimeout() {
        return geminiTimeout;
    }

    public int geminiMaxOutputTokens() {
        return geminiMaxOutputTokens;
    }

    /** Requests per minute to the model, across all customers. The free tier allows 60. */
    public int rateLimitRpm() {
        return rateLimitRpm;
    }

    public int rateLimitPerAccountRpm() {
        return rateLimitPerAccountRpm;
    }

    /** A warning is logged when the last minute has this many requests. */
    public int warnRpm() {
        return warnRpm;
    }
}
