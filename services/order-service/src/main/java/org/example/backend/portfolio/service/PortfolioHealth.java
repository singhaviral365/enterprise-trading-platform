package org.example.backend.portfolio.service;

import org.example.backend.portfolio.dto.HealthResponse;
import org.example.backend.portfolio.quote.QuoteCache;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * What {@code /health} reports. Postgres is pinged. Fauxnance is reported from what the <i>last real quote call</i> did,
 * not from a call made for the health check: a probe must not spend quota. {@code quotaRemaining} comes from the usage
 * endpoint, which the quote source asks for at most every ten minutes.
 */
@Component
public class PortfolioHealth {

    private final DataSource dataSource;
    private final QuoteCache quotes;
    private final boolean fauxnanceConfigured;
    private final Clock clock;

    @Autowired
    public PortfolioHealth(
            DataSource dataSource,
            QuoteCache quotes,
            @Value("${portfolio.quote.base-url:}") String baseUrl) {
        this(dataSource, quotes, baseUrl != null && !baseUrl.isBlank(), Clock.systemUTC());
    }

    /** For tests that fix the clock and say whether Fauxnance is configured. */
    public PortfolioHealth(DataSource dataSource, QuoteCache quotes, boolean fauxnanceConfigured, Clock clock) {
        this.dataSource = dataSource;
        this.quotes = quotes;
        this.fauxnanceConfigured = fauxnanceConfigured;
        this.clock = clock;
    }

    public HealthResponse check() {
        String postgres = postgresStatus();
        String fauxnance = fauxnanceStatus();
        Integer quota = fauxnanceConfigured ? quotes.remainingQuota() : null;

        boolean degraded = !"ok".equals(postgres) || !"ok".equals(fauxnance);
        return new HealthResponse(
                degraded ? "degraded" : "ok",
                List.of(
                        new HealthResponse.Dependency("postgres", postgres, null),
                        new HealthResponse.Dependency("fauxnance", fauxnance, quota)),
                OffsetDateTime.now(clock));
    }

    private String postgresStatus() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(2) ? "ok" : "down";
        } catch (Exception ex) {
            return "down";
        }
    }

    private String fauxnanceStatus() {
        if (!fauxnanceConfigured) {
            return "down";
        }
        return switch (quotes.lastOutcome()) {
            case NEVER, OK -> "ok";
            case QUOTA_EXHAUSTED -> "degraded";
            case FAILED -> "down";
        };
    }
}
