package org.example.trade_executor.strategy.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * What the strategy worker is configured with. Secrets and the order-service address come from the environment only.
 *
 * <p><b>The kill switch.</b> {@code strategy.execution.enabled=false} (environment variable {@code STRATEGY_EXECUTION_ENABLED})
 * stops every strategy from being acted on: the worker still reads the market-data topic, so nothing piles up, but it claims
 * nothing and places nothing. It is read on every quote, and it needs a restart of this service to change, which is the
 * point: nothing a customer or a request can do flips it.
 */
@Component
public class StrategySettings {

    private final boolean enabled;
    private final Duration maxQuoteAge;
    private final Duration claimTimeout;
    private final long demoDelayMillis;

    public StrategySettings(
            Environment environment,
            @Value("${strategy.execution.enabled:true}") boolean enabled,
            @Value("${strategy.execution.max-quote-age-seconds:180}") long maxQuoteAgeSeconds,
            @Value("${strategy.execution.claim-timeout-seconds:120}") long claimTimeoutSeconds,
            @Value("${strategy.demo.pre-order-delay-millis:0}") long demoDelayMillis) {
        this.enabled = enabled;
        this.maxQuoteAge = Duration.ofSeconds(Math.max(1, maxQuoteAgeSeconds));
        this.claimTimeout = Duration.ofSeconds(Math.max(30, claimTimeoutSeconds));
        // Honoured only on a development machine: the property can be set anywhere, but it does nothing anywhere else.
        this.demoDelayMillis = environment.acceptsProfiles(Profiles.of("dev", "local"))
                ? Math.max(0, Math.min(demoDelayMillis, 60_000)) : 0;
    }

    public boolean enabled() {
        return enabled;
    }

    /** A quote older than this is never acted on. */
    public Duration maxQuoteAge() {
        return maxQuoteAge;
    }

    /** A strategy claimed for longer than this is taken to have been abandoned by a crash. */
    public Duration claimTimeout() {
        return claimTimeout;
    }

    /** How long to pause between claiming a strategy and sending its order. Zero except in the development profile. */
    public long demoDelayMillis() {
        return demoDelayMillis;
    }
}
