package org.example.backend.watchlist.price;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Latest known price for one symbol, as published to market-data. */
public record Quote(String symbol, BigDecimal price, OffsetDateTime quotedAt) {
}
