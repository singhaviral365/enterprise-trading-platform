package org.example.backend.signals.explain;

import org.example.backend.signals.config.SignalProperties;
import org.example.backend.signals.exceptions.AssistantRateLimitedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;

/**
 * Keeps the platform inside the language model's per-minute allowance (60 a minute on the free tier), and keeps one
 * customer from using all of it. Two sliding one-minute windows: one for everybody, one for each account.
 *
 * <p>A request over either is refused at once rather than queued: a queue would hold a request thread for up to a minute per
 * waiting request, and the customer is better told to try again in a moment. A warning is logged when the whole platform's last
 * minute reaches the warning level, well before the limit.
 *
 * <p>In memory, per instance. With one order-service the limit is exact; with several, each instance keeps its own share of it,
 * which is why the setting is per instance.
 */
@Component
public class AssistantRateLimiter {

    private static final Logger LOGGER = LoggerFactory.getLogger(AssistantRateLimiter.class);
    private static final long WINDOW_MILLIS = 60_000;

    private final SignalProperties properties;
    private final Clock clock;
    private final Deque<Long> global = new ArrayDeque<>();
    private final Map<Long, Deque<Long>> perAccount = new HashMap<>();

    @Autowired
    public AssistantRateLimiter(SignalProperties properties) {
        this(properties, Clock.systemUTC());
    }

    AssistantRateLimiter(SignalProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    /** @return true and counts the request, or false (counting nothing) if either window is full */
    public synchronized boolean tryAcquire(long accountId) {
        long now = clock.millis();
        trim(global, now);

        Deque<Long> mine = perAccount.computeIfAbsent(accountId, id -> new ArrayDeque<>());
        trim(mine, now);

        if (global.size() >= properties.rateLimitRpm() || mine.size() >= properties.rateLimitPerAccountRpm()) {
            if (mine.isEmpty()) {
                perAccount.remove(accountId);
            }
            return false;
        }

        global.addLast(now);
        mine.addLast(now);

        if (global.size() == properties.warnRpm()) {
            LOGGER.warn("The assistant has made {} model requests in the last minute (limit {})",
                    global.size(), properties.rateLimitRpm());
        }
        if (perAccount.size() > 1000) {
            perAccount.values().removeIf(window -> {
                trim(window, now);
                return window.isEmpty();
            });
        }
        return true;
    }

    /** @throws AssistantRateLimitedException when the request must wait */
    public void acquireOrThrow(long accountId) {
        if (!tryAcquire(accountId)) {
            throw new AssistantRateLimitedException(retryAfterSeconds());
        }
    }

    /** Seconds until the oldest request in the busiest window leaves it. */
    public synchronized long retryAfterSeconds() {
        long now = clock.millis();
        trim(global, now);
        Long oldest = global.peekFirst();
        return oldest == null ? 1 : Math.max(1, (WINDOW_MILLIS - (now - oldest) + 999) / 1000);
    }

    private static void trim(Deque<Long> window, long now) {
        while (!window.isEmpty() && now - window.peekFirst() >= WINDOW_MILLIS) {
            window.removeFirst();
        }
    }
}
