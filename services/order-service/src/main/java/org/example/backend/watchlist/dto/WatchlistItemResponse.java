package org.example.backend.watchlist.dto;

import org.example.backend.watchlist.price.PriceStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One instrument on a watchlist, with its latest price. {@code price} and {@code quotedAt} are null
 * (and {@code priceStatus} is {@code UNAVAILABLE}) until a quote has been received for the symbol. {@code alert} is the
 * entry's price alert, or null if none is set.
 */
public record WatchlistItemResponse(
        String tickerSymbol,
        OffsetDateTime addedAt,
        BigDecimal price,
        OffsetDateTime quotedAt,
        PriceStatus priceStatus,
        PriceAlertResponse alert) {

    /** An entry with no alert. */
    public WatchlistItemResponse(
            String tickerSymbol,
            OffsetDateTime addedAt,
            BigDecimal price,
            OffsetDateTime quotedAt,
            PriceStatus priceStatus) {
        this(tickerSymbol, addedAt, price, quotedAt, priceStatus, null);
    }
}
