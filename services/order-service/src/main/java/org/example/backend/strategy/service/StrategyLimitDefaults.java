package org.example.backend.strategy.service;

import org.example.backend.enums.OrderSide;
import org.example.backend.strategy.config.StrategyLimits;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Works out the two safety limits of a strategy when the customer did not type them, so the saved strategy always has both
 * (the columns are NOT NULL and every guard in the executor reads them) without asking anyone to invent a number.
 *
 * <ul>
 *   <li><b>Spending cap</b> (in the account currency): quantity x trigger price x (1 + buffer), converted from the
 *       instrument's currency, rounded up to a whole unit and never above the platform ceiling. The buffer
 *       ({@code strategy.limits.default-buffer-percent}, 15) lets ordinary slippage through and stops a real gap.</li>
 *   <li><b>Largest holding</b> (units): for a BUY what the customer holds now plus quantity x the number of runs; for a SELL
 *       what they hold now (the executor refuses to sell more than is held anyway). Never below the quantity.</li>
 * </ul>
 */
final class StrategyLimitDefaults {

    private StrategyLimitDefaults() {
    }

    /**
     * @param valueInAccountCurrency quantity x trigger price, already converted into the account currency
     */
    static BigDecimal spendingCap(BigDecimal valueInAccountCurrency, StrategyLimits limits) {
        BigDecimal buffer = BigDecimal.valueOf(100L + limits.defaultBufferPercent()).movePointLeft(2);
        BigDecimal cap = valueInAccountCurrency.multiply(buffer).setScale(0, RoundingMode.CEILING);
        cap = cap.max(BigDecimal.ONE);
        return cap.min(limits.maxOrderValue());
    }

    static long largestHolding(OrderSide side, long held, long quantity, int executions, StrategyLimits limits) {
        long wanted = side == OrderSide.BUY ? held + quantity * executions : held;
        return Math.min(limits.maxPositionQty(), Math.max(wanted, Math.max(quantity, 1)));
    }
}
