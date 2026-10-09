package org.example.backend.portfolio.quote;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One Fauxnance quote as received, in the <b>instrument's</b> currency (the valuation converts it).
 *
 * @param currency      the quote's own currency, or null if the response did not say (the instrument's is used then)
 * @param previousClose the previous close, or null
 * @param asOf          when Fauxnance observed the price, or null if it did not say
 * @param stale         Fauxnance's own flag: true when it served an old value because its upstreams were unavailable
 */
public record Quote(
        String symbol,
        BigDecimal price,
        String currency,
        BigDecimal previousClose,
        Instant asOf,
        boolean stale) {
}
