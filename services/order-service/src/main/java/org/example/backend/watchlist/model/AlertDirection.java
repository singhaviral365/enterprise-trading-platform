package org.example.backend.watchlist.model;

import java.math.BigDecimal;

/** Which way the price has to move to reach the target. An alert is one direction, never both. */
public enum AlertDirection {

    /** Fires when the price rises to the target or above it. */
    ABOVE,

    /** Fires when the price falls to the target or below it. */
    BELOW;

    /** True once {@code price} has reached {@code target} in this direction. Reaching it exactly counts. */
    public boolean reachedBy(BigDecimal price, BigDecimal target) {
        int comparison = price.compareTo(target);
        return this == ABOVE ? comparison >= 0 : comparison <= 0;
    }
}
