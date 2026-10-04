package org.example.trade_executor.fx;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CurrencyConversionServiceTest {

    private final AtomicInteger calls = new AtomicInteger();
    private boolean failing;
    private MutableClock clock;
    private CurrencyConversionService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-04T05:00:00Z"));
        ExchangeRateClient client = baseCode -> {
            calls.incrementAndGet();
            if (failing) {
                throw new ExchangeRateUnavailableException("down");
            }
            return new ExchangeRates(
                    baseCode,
                    Map.of(
                            "USD", BigDecimal.ONE,
                            "INR", new BigDecimal("96.35332268"),
                            "EUR", new BigDecimal("0.88867465")),
                    clock.instant());
        };
        service = new CurrencyConversionService(client, "USD", 60, clock);
    }

    @Test
    void sameCurrencyIsReturnedUnchangedWithoutCallingTheRateService() {
        BigDecimal amount = new BigDecimal("1100.00");

        assertEquals(amount, service.convert(amount, "inr", "INR"));
        assertEquals(0, calls.get());
    }

    @Test
    void convertsRupeesToDollarsThroughTheBaseCurrency() {
        BigDecimal usd = service.convert(new BigDecimal("1100"), "INR", "USD");

        // 1100 / 96.35332268 = 11.4163...
        assertEquals(new BigDecimal("11.4163"), usd.setScale(4, java.math.RoundingMode.HALF_UP));
    }

    @Test
    void convertsBetweenTwoNonBaseCurrencies() {
        BigDecimal eur = service.convert(new BigDecimal("1100"), "INR", "EUR");

        // 1100 INR -> 11.4163 USD -> 10.1454 EUR
        assertEquals(new BigDecimal("10.1454"), eur.setScale(4, java.math.RoundingMode.HALF_UP));
    }

    @Test
    void ratesAreCachedUntilTheTtlExpires() {
        service.convert(BigDecimal.TEN, "INR", "USD");
        service.convert(BigDecimal.TEN, "USD", "EUR");
        assertEquals(1, calls.get());

        clock.advance(Duration.ofMinutes(61));
        service.convert(BigDecimal.TEN, "INR", "USD");
        assertEquals(2, calls.get());
    }

    @Test
    void staleRatesAreKeptWhenARefreshFailsAndRetriedAfterABackoff() {
        service.convert(BigDecimal.TEN, "INR", "USD");
        failing = true;
        clock.advance(Duration.ofMinutes(61));

        assertTrue(service.convert(BigDecimal.TEN, "INR", "USD").signum() > 0);
        assertEquals(2, calls.get());

        // Inside the one-minute back-off no further attempt is made.
        service.convert(BigDecimal.TEN, "INR", "USD");
        assertEquals(2, calls.get());

        clock.advance(Duration.ofMinutes(2));
        service.convert(BigDecimal.TEN, "INR", "USD");
        assertEquals(3, calls.get());
    }

    @Test
    void failsWhenThereAreNoRatesAtAll() {
        failing = true;

        assertThrows(ExchangeRateUnavailableException.class, () -> service.convert(BigDecimal.TEN, "INR", "USD"));
        assertTrue(service.currentRatesIfAvailable().isEmpty());
    }

    @Test
    void failsForACurrencyTheServiceDoesNotKnow() {
        assertThrows(ExchangeRateUnavailableException.class, () -> service.convert(BigDecimal.TEN, "XXX", "USD"));
        assertThrows(ExchangeRateUnavailableException.class, () -> service.convert(BigDecimal.TEN, null, "USD"));
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
