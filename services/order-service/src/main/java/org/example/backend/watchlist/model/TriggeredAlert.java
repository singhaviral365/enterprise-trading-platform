package org.example.backend.watchlist.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** A fired alert with the account it belongs to, read when it is handed to notifications. */
public record TriggeredAlert(
        long watchlistId,
        long accountId,
        String tickerSymbol,
        AlertDirection direction,
        BigDecimal targetPrice,
        BigDecimal triggerPrice,
        OffsetDateTime triggeredAt,
        int attempts) {
}
