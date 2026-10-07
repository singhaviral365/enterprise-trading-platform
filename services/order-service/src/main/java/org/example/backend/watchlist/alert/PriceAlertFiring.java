package org.example.backend.watchlist.alert;

import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.AlertDelivery;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.AlertWatch;
import org.example.backend.watchlist.model.TriggeredAlert;
import org.example.backend.watchlist.price.Quote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.OffsetDateTime;

/**
 * What happens when a quote crosses an alert, and what happens next. Two separate steps, so that failing at the second
 * never undoes the first:
 *
 * <ol>
 *   <li><b>Fire, once.</b> The alert is moved from ACTIVE to TRIGGERED in one guarded statement and removed from the
 *       in-memory index. It does not fire again on later quotes: it stays visible as TRIGGERED, and the customer sets a
 *       new alert to re-arm it. Firing on every quote past the level would send a customer dozens of messages a minute
 *       through a module somebody else owns.</li>
 *   <li><b>Hand over.</b> The fired alert goes to {@link NotificationGateway} in-process. This module never resolves a
 *       channel; notifications does, from the customer's preferences, and records it.</li>
 * </ol>
 *
 * <p><b>When the hand-over raises</b> (the database is unavailable, the account has gone), the alert is not lost and
 * not re-fired: it is already TRIGGERED, and its {@code delivery} becomes {@code FAILED}, which the customer can see.
 * {@link PriceAlertRedelivery} retries it a bounded number of times. The retry is safe because the notification is keyed
 * by the alert, so a hand-over that did succeed but whose record was lost is a no-op the second time.
 */
@Component
public class PriceAlertFiring {

    private static final Logger LOGGER = LoggerFactory.getLogger(PriceAlertFiring.class);

    private final WatchlistMapper mapper;
    private final PriceAlertIndex index;
    private final NotificationGateway gateway;
    private final Clock clock;

    @Autowired
    public PriceAlertFiring(WatchlistMapper mapper, PriceAlertIndex index, NotificationGateway gateway) {
        this(mapper, index, gateway, Clock.systemUTC());
    }

    PriceAlertFiring(WatchlistMapper mapper, PriceAlertIndex index, NotificationGateway gateway, Clock clock) {
        this.mapper = mapper;
        this.index = index;
        this.gateway = gateway;
        this.clock = clock;
    }

    /** @return true if this call fired the alert (false if it had already been fired or replaced) */
    public boolean fire(AlertWatch watch, Quote quote) {
        int changed = mapper.markTriggered(
                watch.watchlistId(),
                watch.tickerSymbol(),
                watch.direction(),
                watch.targetPrice(),
                quote.price(),
                OffsetDateTime.now(clock));

        // Fired by us, fired by someone else, or replaced by the customer: either way it is no longer ours to fire.
        index.remove(watch.watchlistId(), watch.tickerSymbol());
        if (changed == 0) {
            return false;
        }

        handOver(watch.watchlistId(), watch.tickerSymbol());
        return true;
    }

    /** Hands a triggered alert to notifications and records how that went. Safe to call again for the same alert. */
    public void handOver(long watchlistId, String tickerSymbol) {
        TriggeredAlert alert = mapper.selectTriggeredAlert(watchlistId, tickerSymbol).orElse(null);
        if (alert == null) {
            return;
        }

        AlertDelivery outcome;
        try {
            gateway.deliver(request(alert));
            outcome = AlertDelivery.HANDED_OVER;
        } catch (RuntimeException ex) {
            // The class only, never the message: it could carry customer data from the failing layer.
            LOGGER.warn("Hand-over of the price alert on {} (watchlist {}) failed: {}",
                    tickerSymbol, watchlistId, ex.getClass().getSimpleName());
            outcome = AlertDelivery.FAILED;
        }

        try {
            mapper.recordAlertDelivery(watchlistId, tickerSymbol, outcome);
        } catch (RuntimeException ex) {
            // Leaves the alert PENDING, which the redelivery job picks up; the gateway makes the second try a no-op.
            LOGGER.error("Could not record the delivery state of the price alert on {} (watchlist {})",
                    tickerSymbol, watchlistId, ex);
        }
    }

    static NotificationRequest request(TriggeredAlert alert) {
        // Stable across retries (it comes from the stored fire time), so a repeated hand-over is recognised.
        String key = "price-alert:" + alert.watchlistId() + ":" + alert.tickerSymbol() + ":"
                + alert.triggeredAt().toInstant().toEpochMilli();
        return new NotificationRequest(
                alert.accountId(),
                NotificationCategory.WATCHLIST_ALERTS,
                key,
                "Price alert: " + alert.tickerSymbol(),
                message(alert));
    }

    static String message(TriggeredAlert alert) {
        String move = alert.direction() == AlertDirection.ABOVE
                ? "rose to " + price(alert.triggerPrice()) + ", at or above"
                : "fell to " + price(alert.triggerPrice()) + ", at or below";
        return alert.tickerSymbol() + " " + move + " your target of " + price(alert.targetPrice()) + ".";
    }

    /** Two decimals, or up to four when the price really has them. */
    static String price(BigDecimal value) {
        int scale = Math.max(2, Math.min(4, value.stripTrailingZeros().scale()));
        return value.setScale(scale, RoundingMode.HALF_UP).toPlainString();
    }
}
