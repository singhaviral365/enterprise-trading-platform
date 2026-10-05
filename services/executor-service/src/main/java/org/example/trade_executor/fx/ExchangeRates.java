package org.example.trade_executor.fx;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;

/**
 * One snapshot of ExchangeRate-API's "latest" response: how many units of each currency one unit of
 * {@code baseCode} buys, plus when we fetched it.
 */
public record ExchangeRates(
        String baseCode,
        Map<String, BigDecimal> rates,
        Instant fetchedAt) {

    public ExchangeRates {
        Objects.requireNonNull(baseCode, "baseCode is required");
        Objects.requireNonNull(fetchedAt, "fetchedAt is required");
        rates = rates == null ? Map.of() : Map.copyOf(rates);
    }

    public boolean supports(String currency) {
        return currency != null && rates.containsKey(currency);
    }
}
