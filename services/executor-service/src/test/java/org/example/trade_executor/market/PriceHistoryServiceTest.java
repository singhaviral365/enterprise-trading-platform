package org.example.trade_executor.market;

import org.example.trade_executor.client.PriceHistory;
import org.example.trade_executor.client.QuoteClient;
import org.example.trade_executor.client.QuoteUnavailableException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PriceHistoryServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 6);
    private static final PriceHistory HISTORY = new PriceHistory("AAPL", "USD", "1d", List.of(
            new PriceHistory.Candle("2026-10-05", null, null, null, new BigDecimal("332.89"), 1L, false)));

    private QuoteClient quoteClient;
    private MutableClock clock;
    private PriceHistoryService service;

    @BeforeEach
    void setUp() {
        quoteClient = mock(QuoteClient.class);
        clock = new MutableClock(TODAY.atTime(9, 0).toInstant(ZoneOffset.UTC));
        service = new PriceHistoryService(quoteClient, 900, clock);
    }

    @Test
    void asksForOneYearOfDailyCandlesUpToToday() {
        when(quoteClient.getCandles("AAPL", TODAY.minusYears(1), TODAY, "1d")).thenReturn(HISTORY);

        assertSame(HISTORY, service.getLastYear(" aapl "));
    }

    @Test
    void cachesEachSymbolUntilTheTtlRunsOut() {
        when(quoteClient.getCandles(anyString(), any(), any(), anyString())).thenReturn(HISTORY);

        service.getLastYear("AAPL");
        service.getLastYear("AAPL");
        verify(quoteClient, times(1)).getCandles(anyString(), any(), any(), anyString());

        clock.advance(Duration.ofMinutes(16));
        service.getLastYear("AAPL");
        verify(quoteClient, times(2)).getCandles(anyString(), any(), any(), anyString());
    }

    @Test
    void servesTheLastHistoryWhenFauxnanceFailsAndReports503WithoutOne() {
        when(quoteClient.getCandles(eq("AAPL"), any(), any(), anyString()))
                .thenReturn(HISTORY)
                .thenThrow(new QuoteUnavailableException("AAPL", "down"));
        when(quoteClient.getCandles(eq("MSFT"), any(), any(), anyString()))
                .thenThrow(new QuoteUnavailableException("MSFT", "down"));

        service.getLastYear("AAPL");
        clock.advance(Duration.ofMinutes(16));
        assertSame(HISTORY, service.getLastYear("AAPL"));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.getLastYear("MSFT"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
    }

    @Test
    void rejectsSymbolsThatAreNotTickers() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.getLastYear("../quotes"));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verify(quoteClient, never()).getCandles(anyString(), any(), any(), anyString());
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

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
            return now;
        }
    }
}
