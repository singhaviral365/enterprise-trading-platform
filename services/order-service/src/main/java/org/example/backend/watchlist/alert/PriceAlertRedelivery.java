package org.example.backend.watchlist.alert;

import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.TriggeredAlert;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Retries the hand-over of fired alerts whose first attempt failed (or never got recorded), a bounded number of times.
 * After {@code max-delivery-attempts} the alert simply stays TRIGGERED with delivery FAILED, which the customer can see:
 * it is never silent and never retried forever.
 *
 * <p>An alert that fired a moment ago is left alone ({@link #SETTLE_SECONDS}), because the thread that fired it is
 * still handing it over.
 */
@Component
public class PriceAlertRedelivery {

    static final long SETTLE_SECONDS = 5;
    private static final int BATCH = 50;
    private static final Logger LOGGER = LoggerFactory.getLogger(PriceAlertRedelivery.class);

    private final WatchlistMapper mapper;
    private final PriceAlertFiring firing;
    private final int maxAttempts;
    private final Clock clock;

    @Autowired
    public PriceAlertRedelivery(
            WatchlistMapper mapper,
            PriceAlertFiring firing,
            @Value("${watchlist.alerts.max-delivery-attempts:3}") int maxAttempts) {
        this(mapper, firing, maxAttempts, Clock.systemUTC());
    }

    PriceAlertRedelivery(WatchlistMapper mapper, PriceAlertFiring firing, int maxAttempts, Clock clock) {
        this.mapper = mapper;
        this.firing = firing;
        this.maxAttempts = Math.max(1, maxAttempts);
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${watchlist.alerts.redelivery-interval-millis:60000}")
    public void retryUndelivered() {
        try {
            retry();
        } catch (RuntimeException ex) {
            LOGGER.error("Retrying undelivered price alerts failed; will try again", ex);
        }
    }

    /** @return how many alerts were handed over again */
    public int retry() {
        List<TriggeredAlert> pending = mapper.selectUndeliveredAlerts(
                maxAttempts, OffsetDateTime.now(clock).minusSeconds(SETTLE_SECONDS), BATCH);
        for (TriggeredAlert alert : pending) {
            firing.handOver(alert.watchlistId(), alert.tickerSymbol());
        }
        return pending.size();
    }
}
