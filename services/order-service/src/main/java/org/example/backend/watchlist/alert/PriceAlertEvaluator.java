package org.example.backend.watchlist.alert;

import org.example.backend.watchlist.model.AlertWatch;
import org.example.backend.watchlist.price.Quote;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Decides, for one quote, whether it crosses any armed alert, and fires the ones it does. This is the hot path: every
 * quote for every symbol comes through, so the first thing it does is the index lookup, and a symbol with no alerts
 * returns immediately.
 *
 * <p><b>What "crossed" means.</b> An {@code ABOVE} alert is crossed by a quote at or over its target, a {@code BELOW}
 * alert by a quote at or under it. An alert whose target the price had already reached is refused when it is set, so
 * "crossed" always means the price moved through the level, never that the alert was born past it.
 *
 * <p>Runs on the Kafka listener thread, with nobody logged in: it holds no token and reads no customer data until a
 * level is crossed, so there is no per-request authorisation here; the account comes from the stored alert.
 */
@Component
public class PriceAlertEvaluator {

    private final PriceAlertIndex index;
    private final PriceAlertFiring firing;

    public PriceAlertEvaluator(PriceAlertIndex index, PriceAlertFiring firing) {
        this.index = index;
        this.firing = firing;
    }

    /** @return how many alerts this quote fired */
    public int evaluate(Quote quote) {
        List<AlertWatch> candidates = index.candidates(quote.symbol());
        if (candidates.isEmpty()) {
            return 0;
        }

        int fired = 0;
        for (AlertWatch watch : candidates) {
            if (watch.crossedBy(quote.price()) && firing.fire(watch, quote)) {
                fired++;
            }
        }
        return fired;
    }
}
