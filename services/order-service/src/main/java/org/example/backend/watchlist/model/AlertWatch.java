package org.example.backend.watchlist.model;

import java.math.BigDecimal;

/**
 * What the per-quote lookup holds for one active alert: just enough to decide whether a quote crosses it. No account,
 * no customer data: the account is only read from the database once a quote has actually crossed the level.
 */
public record AlertWatch(long watchlistId, String tickerSymbol, AlertDirection direction, BigDecimal targetPrice) {

    public boolean crossedBy(BigDecimal price) {
        return direction.reachedBy(price, targetPrice);
    }
}
