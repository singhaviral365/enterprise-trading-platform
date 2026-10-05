package org.example.backend.fx;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Converts money between currencies using ExchangeRate-API rates, which are cached for
 * {@code trading.fx.cache-ttl-minutes} so a burst of orders costs one API call, not one each.
 *
 * <ul>
 *   <li>Same currency in and out never touches the rate service.</li>
 *   <li>If a refresh fails, the last rates are kept (and retried after a short back-off) rather than blocking
 *       trading on a rate that moved a fraction of a percent; with no rates at all the conversion fails.</li>
 * </ul>
 */
@Service
public class CurrencyConversionService {

    private static final Logger LOGGER = LoggerFactory.getLogger(CurrencyConversionService.class);

    private static final MathContext RATE_PRECISION = new MathContext(16, RoundingMode.HALF_UP);
    private static final Duration FAILED_REFRESH_BACKOFF = Duration.ofMinutes(1);

    private final ExchangeRateClient client;
    private final String baseCurrency;
    private final Duration cacheTtl;
    private final Clock clock;

    private ExchangeRates cached;
    private Instant nextRefreshAt = Instant.MIN;

    @Autowired
    public CurrencyConversionService(
            ExchangeRateClient client,
            @Value("${trading.fx.base-currency:USD}") String baseCurrency,
            @Value("${trading.fx.cache-ttl-minutes:180}") long cacheTtlMinutes) {

        this(client, baseCurrency, cacheTtlMinutes, Clock.systemUTC());
    }

    CurrencyConversionService(ExchangeRateClient client, String baseCurrency, long cacheTtlMinutes, Clock clock) {
        this.client = client;
        this.baseCurrency = baseCurrency.toUpperCase();
        this.cacheTtl = Duration.ofMinutes(Math.max(1L, cacheTtlMinutes));
        this.clock = clock;
    }

    /** {@code amount} in {@code from} expressed in {@code to}. Not rounded: the caller picks the scale it stores. */
    public BigDecimal convert(BigDecimal amount, String from, String to) {
        String source = normalise(from);
        String target = normalise(to);
        if (source.equals(target)) {
            return amount;
        }

        ExchangeRates rates = currentRates();
        if (!rates.supports(source) || !rates.supports(target)) {
            throw new ExchangeRateUnavailableException("No exchange rate for " + source + " -> " + target);
        }

        // Rates are per one unit of the base currency: amount[from] / rate[from] = base, base * rate[to] = amount[to].
        BigDecimal factor = rates.rates().get(target).divide(rates.rates().get(source), RATE_PRECISION);
        return amount.multiply(factor, RATE_PRECISION);
    }

    /** The cached rates, refreshed when stale. Throws when there is nothing cached and the service cannot be reached. */
    public synchronized ExchangeRates currentRates() {
        Instant now = clock.instant();
        if (cached == null || !now.isBefore(nextRefreshAt)) {
            try {
                cached = client.fetchLatest(baseCurrency);
                nextRefreshAt = now.plus(cacheTtl);
            } catch (ExchangeRateUnavailableException ex) {
                if (cached == null) {
                    throw ex;
                }
                LOGGER.warn("Exchange rate refresh failed, using rates from {}: {}", cached.fetchedAt(), ex.getMessage());
                nextRefreshAt = now.plus(FAILED_REFRESH_BACKOFF);
            }
        }
        return cached;
    }

    private static String normalise(String currency) {
        if (currency == null || currency.isBlank()) {
            throw new ExchangeRateUnavailableException("Currency code is missing");
        }
        return currency.trim().toUpperCase();
    }
}
