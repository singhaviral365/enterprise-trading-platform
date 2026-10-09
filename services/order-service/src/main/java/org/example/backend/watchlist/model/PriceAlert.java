package org.example.backend.watchlist.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * The alert on one watchlist entry. While {@code ACTIVE}, {@code triggeredAt}, {@code triggerPrice} and
 * {@code delivery} are null; once {@code TRIGGERED} they are all set.
 */
public record PriceAlert(
        AlertDirection direction,
        BigDecimal targetPrice,
        AlertStatus status,
        OffsetDateTime setAt,
        OffsetDateTime triggeredAt,
        BigDecimal triggerPrice,
        AlertDelivery delivery) {
}
