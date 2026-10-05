package org.example.backend.watchlist.dto;

import org.example.backend.watchlist.price.PriceStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One instrument on a watchlist, with its latest price. {@code price} and {@code quotedAt} are null
 * (and {@code priceStatus} is {@code UNAVAILABLE}) until a quote has been received for the symbol.
 */
public record WatchlistItemResponse(
        String tickerSymbol,
        OffsetDateTime addedAt,
        BigDecimal price,
        OffsetDateTime quotedAt,
        PriceStatus priceStatus) {
}
