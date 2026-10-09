package org.example.trade_executor.market;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * The market board. {@code fxRates} holds one unit of {@code baseCurrency} in every currency (from
 * ExchangeRate-API) so the UI can show what a quote costs in the account's currency; it is null when the rate
 * service is unavailable.
 */
public record MarketBoard(
        List<MarketQuote> quotes,
        String asOf,
        boolean stale,
        String baseCurrency,
        Map<String, BigDecimal> fxRates) {

    public MarketBoard(List<MarketQuote> quotes, String asOf, boolean stale) {
        this(quotes, asOf, stale, null, null);
    }
}
