package org.example.backend.signals.explain;

import org.example.backend.signals.SignalTestSupport;
import org.example.backend.signals.exceptions.AssistantRateLimitedException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AssistantRateLimiterTest {

    private final AtomicReference<Instant> now = new AtomicReference<>(SignalTestSupport.NOW);

    private final Clock clock = new Clock() {
        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    };

    private AssistantRateLimiter limiter(int rpm, int perAccount) {
        return new AssistantRateLimiter(SignalTestSupport.properties("key", rpm, perAccount), clock);
    }

    @Test
    void allowsUpToTheGlobalLimitInAMinuteAndRefusesTheNext() {
        AssistantRateLimiter limiter = limiter(3, 10);

        assertTrue(limiter.tryAcquire(1));
        assertTrue(limiter.tryAcquire(2));
        assertTrue(limiter.tryAcquire(3));
        assertFalse(limiter.tryAcquire(4));
    }

    @Test
    void oneAccountCannotUseTheWholeAllowance() {
        AssistantRateLimiter limiter = limiter(60, 2);

        assertTrue(limiter.tryAcquire(7));
        assertTrue(limiter.tryAcquire(7));
        assertFalse(limiter.tryAcquire(7));
        assertTrue(limiter.tryAcquire(8), "another customer is not affected");
    }

    @Test
    void aRefusedRequestIsNotCounted() {
        AssistantRateLimiter limiter = limiter(60, 1);

        assertTrue(limiter.tryAcquire(7));
        assertFalse(limiter.tryAcquire(7));
        assertFalse(limiter.tryAcquire(7));

        now.set(now.get().plusSeconds(61));
        assertTrue(limiter.tryAcquire(7));
    }

    @Test
    void theWindowSlides() {
        AssistantRateLimiter limiter = limiter(2, 10);

        assertTrue(limiter.tryAcquire(1));
        now.set(now.get().plusSeconds(30));
        assertTrue(limiter.tryAcquire(1));
        assertFalse(limiter.tryAcquire(1));

        now.set(now.get().plusSeconds(31));
        assertTrue(limiter.tryAcquire(1), "the first one left the window, the second has not");
        assertFalse(limiter.tryAcquire(1));
    }

    @Test
    void anOverLimitRequestCarriesTheSecondsToWaitForTheOldestToLeave() {
        AssistantRateLimiter limiter = limiter(1, 10);
        limiter.tryAcquire(1);
        now.set(now.get().plusSeconds(20));

        AssistantRateLimitedException ex = assertThrows(AssistantRateLimitedException.class, () -> limiter.acquireOrThrow(1));

        assertEquals("AST-429", ex.getErrorCode());
        assertEquals(40, ex.getRetryAfterSeconds());
    }
}
