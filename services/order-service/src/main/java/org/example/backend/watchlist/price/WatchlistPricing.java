package org.example.backend.watchlist.price;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

/** Turns the latest known quote for a symbol into the price a customer sees. */
@Component
public class WatchlistPricing {

    private final Duration staleAfter;
    private final Clock clock;

    @Autowired
    public WatchlistPricing(@Value("${watchlist.price.stale-after-seconds:300}") long staleAfterSeconds) {
        this(staleAfterSeconds, Clock.systemUTC());
    }

    public WatchlistPricing(long staleAfterSeconds, Clock clock) {
        this.staleAfter = Duration.ofSeconds(Math.max(1L, staleAfterSeconds));
        this.clock = clock;
    }

    /** @param quote the latest quote for the symbol, or null if there is none */
    public PriceView viewOf(Quote quote) {
        if (quote == null) {
            return PriceView.unavailable();
        }
        Duration age = Duration.between(quote.quotedAt(), OffsetDateTime.now(clock));
        PriceStatus status = age.compareTo(staleAfter) > 0 ? PriceStatus.STALE : PriceStatus.LIVE;
        return new PriceView(quote.price(), quote.quotedAt(), status);
    }
}
