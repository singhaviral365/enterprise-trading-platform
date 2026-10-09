package org.example.backend.watchlist.price;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** What the API shows beside a watchlist entry. {@code price} and {@code quotedAt} are null when UNAVAILABLE. */
public record PriceView(BigDecimal price, OffsetDateTime quotedAt, PriceStatus status) {

    public static PriceView unavailable() {
        return new PriceView(null, null, PriceStatus.UNAVAILABLE);
    }
}
