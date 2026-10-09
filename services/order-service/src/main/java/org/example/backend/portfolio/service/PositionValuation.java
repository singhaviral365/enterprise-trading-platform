package org.example.backend.portfolio.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The portfolio arithmetic, as {@code portfolio-api.yaml} defines it, as pure functions. Money is rounded to 2 places
 * {@code HALF_UP}, as the executor rounds; percentages to 2 places. Everything is in the account's currency.
 *
 * <ul>
 *   <li>cost basis = quantity * average cost</li>
 *   <li>market value = quantity * last price</li>
 *   <li>unrealised P&amp;L = market value - cost basis (never stored)</li>
 *   <li>day P&amp;L = quantity * (last price - previous close) (never stored)</li>
 * </ul>
 */
final class PositionValuation {

    private static final int SCALE = 2;

    private PositionValuation() {
    }

    static BigDecimal money(BigDecimal value) {
        return value.setScale(SCALE, RoundingMode.HALF_UP);
    }

    static BigDecimal costBasis(long quantity, BigDecimal averageCost) {
        return money(averageCost.multiply(BigDecimal.valueOf(quantity)));
    }

    static BigDecimal marketValue(long quantity, BigDecimal lastPrice) {
        return money(lastPrice.multiply(BigDecimal.valueOf(quantity)));
    }

    /** Null when the previous close is not known: unknown is not zero. */
    static BigDecimal dayPnl(long quantity, BigDecimal lastPrice, BigDecimal previousClose) {
        if (previousClose == null) {
            return null;
        }
        return money(lastPrice.subtract(previousClose).multiply(BigDecimal.valueOf(quantity)));
    }

    /** {@code part} as a percentage of {@code whole}, 2 places; null when there is no whole to compare with. */
    static BigDecimal percent(BigDecimal part, BigDecimal whole) {
        if (part == null || whole == null || whole.signum() == 0) {
            return null;
        }
        return part.multiply(BigDecimal.valueOf(100)).divide(whole, SCALE, RoundingMode.HALF_UP);
    }
}
