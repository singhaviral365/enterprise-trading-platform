package org.example.backend.portfolio.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * {@code PricedPosition} in {@code contracts/portfolio-api.yaml}. Deliberately only the contract's fields (plus the
 * day-P&L additions): the instrument's name and icon are not here, the screen already has them from the positions route.
 *
 * <p>Price fields are null when the instrument could not be priced, and {@code stale} is then true. {@code lastPrice},
 * {@code previousClose}, {@code marketValue} and the P&L figures are in the account's currency; {@code currency} is the
 * instrument's own.
 */
public record PricedPositionResponse(
        long accountId,
        String symbol,
        int quantity,
        BigDecimal averageCost,
        BigDecimal costBasis,
        BigDecimal lastPrice,
        BigDecimal previousClose,
        BigDecimal marketValue,
        BigDecimal unrealisedPnl,
        BigDecimal unrealisedPnlPercent,
        BigDecimal dayPnl,
        BigDecimal dayPnlPercent,
        String currency,
        OffsetDateTime priceAsOf,
        boolean stale) {
}
