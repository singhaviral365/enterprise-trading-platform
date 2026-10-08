package org.example.backend.service;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Map;

/**
 * The smallest opening balance for each currency an account can be opened in. A per-currency table, not one number and not
 * an exchange rate: 20,000 is a USD-sized amount (20,000 JPY is about 130 dollars), and a table keeps the amounts
 * deterministic with no rate call at account creation.
 *
 * <p>The defaults below are about 20,000 USD in each currency, rounded. Each can be overridden in configuration:
 * {@code account.opening.minimum.JPY=3000000}.
 */
@Component
public class OpeningBalanceMinimums {

    static final Map<String, BigDecimal> DEFAULTS = Map.ofEntries(
            Map.entry("USD", new BigDecimal("20000")),
            Map.entry("EUR", new BigDecimal("18000")),
            Map.entry("GBP", new BigDecimal("16000")),
            Map.entry("INR", new BigDecimal("1600000")),
            Map.entry("JPY", new BigDecimal("3000000")),
            Map.entry("CAD", new BigDecimal("27000")),
            Map.entry("AUD", new BigDecimal("30000")),
            Map.entry("CHF", new BigDecimal("17000")),
            Map.entry("SGD", new BigDecimal("27000")),
            Map.entry("CNY", new BigDecimal("145000")));

    private final Environment environment;

    public OpeningBalanceMinimums(Environment environment) {
        this.environment = environment;
    }

    /** The minimum opening balance in {@code currency} (a supported code). */
    public BigDecimal forCurrency(String currency) {
        BigDecimal fallback = DEFAULTS.getOrDefault(currency, DEFAULTS.get("USD"));
        BigDecimal configured = environment.getProperty("account.opening.minimum." + currency, BigDecimal.class);
        return configured != null ? configured : fallback;
    }
}
