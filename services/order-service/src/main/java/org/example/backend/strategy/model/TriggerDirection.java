package org.example.backend.strategy.model;

import java.math.BigDecimal;

/** Which side of its trigger price a strategy fires on. */
public enum TriggerDirection {
    /** Fires when the price is at or under the trigger. */
    BELOW,
    /** Fires when the price is at or over the trigger. */
    ABOVE;

    /** True when {@code price} satisfies the condition, whether or not it just crossed. */
    public boolean reachedBy(BigDecimal price, BigDecimal trigger) {
        int comparison = price.compareTo(trigger);
        return this == BELOW ? comparison <= 0 : comparison >= 0;
    }
}
