package org.example.backend.portfolio.quote;

import java.time.Instant;

/**
 * A quote together with what the portfolio must say about it.
 *
 * @param observedAt when the price was observed: the quote's own {@code asOf}, or when this service fetched it if the
 *                   quote did not say
 * @param stale      true if Fauxnance flagged it stale, or it is older than the freshness window, or it is an earlier
 *                   quote kept because a refresh failed. Stale is a state, not an error: the number is still served.
 */
public record ObservedQuote(Quote quote, Instant observedAt, boolean stale) {
}
