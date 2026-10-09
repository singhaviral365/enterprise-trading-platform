package org.example.backend.strategy.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * The platform's own ceilings on what a customer may ask a strategy to do. A customer chooses their limits, but never
 * above these, so a mistyped extra zero cannot arm a strategy that can spend more than the platform is willing to let
 * unattended code spend.
 */
@Component
public class StrategyLimits {

    private final int maxOpenPerAccount;
    private final long maxQuantity;
    private final BigDecimal maxOrderValue;
    private final long maxPositionQty;
    private final int maxWindowDays;
    private final long armFreshSeconds;
    private final int defaultBufferPercent;

    public StrategyLimits(
            @Value("${strategy.limits.max-open-per-account:20}") int maxOpenPerAccount,
            @Value("${strategy.limits.max-quantity:1000000}") long maxQuantity,
            @Value("${strategy.limits.max-order-value:10000000}") BigDecimal maxOrderValue,
            @Value("${strategy.limits.max-position-qty:10000000}") long maxPositionQty,
            @Value("${strategy.limits.max-window-days:366}") int maxWindowDays,
            @Value("${strategy.limits.arm-fresh-seconds:300}") long armFreshSeconds,
            @Value("${strategy.limits.default-buffer-percent:15}") int defaultBufferPercent) {
        this.maxOpenPerAccount = Math.max(1, maxOpenPerAccount);
        this.maxQuantity = Math.max(1, maxQuantity);
        this.maxOrderValue = maxOrderValue;
        this.maxPositionQty = Math.max(1, maxPositionQty);
        this.maxWindowDays = Math.max(1, maxWindowDays);
        this.armFreshSeconds = Math.max(1, armFreshSeconds);
        this.defaultBufferPercent = Math.max(0, defaultBufferPercent);
    }

    /** How many ACTIVE, EXECUTING or DISABLED strategies one account may hold. */
    public int maxOpenPerAccount() {
        return maxOpenPerAccount;
    }

    public long maxQuantity() {
        return maxQuantity;
    }

    public BigDecimal maxOrderValue() {
        return maxOrderValue;
    }

    public long maxPositionQty() {
        return maxPositionQty;
    }

    /** How far ahead a strategy's end date may be. */
    public int maxWindowDays() {
        return maxWindowDays;
    }

    /**
     * How far above quantity x trigger price the derived spending cap sits, in percent, so ordinary slippage passes and a real
     * gap is stopped. Only used when the customer sent no cap.
     */
    public int defaultBufferPercent() {
        return defaultBufferPercent;
    }

    /** A quote older than this is not taken as proof the price was on the safe side when the strategy was created. */
    public long armFreshSeconds() {
        return armFreshSeconds;
    }
}
