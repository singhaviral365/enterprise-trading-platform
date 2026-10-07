package org.example.backend.portfolio.performance;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One day of one symbol, as Fauxnance published it. {@code close} is the price as traded (what holdings are valued with, since
 * share counts are never restated); {@code adjclose} is restated for splits and dividends (what benchmark returns use).
 *
 * @param currency  the currency the prices are in, or null if the response did not say
 * @param synthetic Fauxnance generated this row to bridge an upstream gap, so a day that uses it is shown as estimated
 */
public record DailyCandle(
        String symbol,
        LocalDate date,
        BigDecimal close,
        BigDecimal adjclose,
        String currency,
        boolean synthetic) {
}
