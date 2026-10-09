package org.example.backend.portfolio.performance;

import org.example.backend.portfolio.mapper.PerformanceMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CandleStoreTest {

    private static final LocalDate FROM = LocalDate.of(2026, 6, 1);
    private static final LocalDate TO = LocalDate.of(2026, 10, 6);

    private final List<String> calls = new ArrayList<>();
    private PerformanceMapper mapper;
    private CandleSource source;
    private CandleStore store;
    private CandleSourceException failure;

    private static DailyCandle candle(LocalDate date) {
        return new DailyCandle("AAPL", date, BigDecimal.TEN, BigDecimal.TEN, "USD", false);
    }

    @BeforeEach
    void setUp() {
        mapper = mock(PerformanceMapper.class);
        source = (symbol, from, to) -> {
            calls.add(symbol + " " + from + ".." + to);
            if (failure != null) {
                throw failure;
            }
            return List.of(candle(to));
        };
        store = new CandleStore(source, mapper, 5, Clock.fixed(Instant.parse("2026-10-07T01:30:00Z"), ZoneOffset.UTC));
    }

    @Test
    void aSymbolNeverFetchedIsFetchedOnceForTheWholeRangeNotPerDay() {
        store.ensure("aapl", FROM, TO, new CandleBudget(10));

        assertEquals(List.of("AAPL 2026-06-01..2026-10-06"), calls);
        verify(mapper).upsertCandle("AAPL", TO, BigDecimal.TEN, BigDecimal.TEN, "USD", false);
    }

    @Test
    void aStoredSymbolIsToppedUpFromTheLastFewDaysSoASyntheticCandleHeals() {
        when(mapper.selectFirstCandleDate("AAPL")).thenReturn(FROM);
        when(mapper.selectLastCandleDate("AAPL")).thenReturn(LocalDate.of(2026, 10, 3));

        store.ensure("AAPL", FROM, TO, new CandleBudget(10));

        assertEquals(List.of("AAPL 2026-09-29..2026-10-06"), calls, "from 5 days back, one call");
    }

    @Test
    void anUpToDateSymbolMakesNoCall() {
        when(mapper.selectFirstCandleDate("AAPL")).thenReturn(FROM);
        when(mapper.selectLastCandleDate("AAPL")).thenReturn(TO);

        store.ensure("AAPL", FROM, TO, new CandleBudget(10));

        assertTrue(calls.isEmpty());
    }

    @Test
    void missingEarlyHistoryIsAskedForOnceNotEveryNight() {
        when(mapper.selectFirstCandleDate("AAPL")).thenReturn(LocalDate.of(2026, 8, 1));
        when(mapper.selectLastCandleDate("AAPL")).thenReturn(TO);

        store.ensure("AAPL", FROM, TO, new CandleBudget(10));

        assertEquals(List.of("AAPL 2026-06-01..2026-07-31"), calls);
    }

    @Test
    void theBudgetLimitsTheCalls() {
        CandleBudget budget = new CandleBudget(1);

        store.ensure("AAPL", FROM, TO, budget);
        store.ensure("MSFT", FROM, TO, budget);

        assertEquals(1, calls.size());
        assertTrue(budget.isStopped());
    }

    @Test
    void aQuotaErrorStopsTheRunAndLeavesWhatIsStored() {
        failure = new CandleSourceException("quota", CandleSourceException.Kind.QUOTA);
        CandleBudget budget = new CandleBudget(10);

        store.ensure("AAPL", FROM, TO, budget);

        assertTrue(budget.isStopped(), "nothing more is asked for today");
        verify(mapper, never()).upsertCandle(anyString(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    void anotherFailureLeavesTheSymbolForTheNextRunWithoutStoppingTheBudget() {
        failure = new CandleSourceException("down", CandleSourceException.Kind.FAILED);
        CandleBudget budget = new CandleBudget(10);

        store.ensure("AAPL", FROM, TO, budget);

        assertFalse(budget.isStopped());
        failure = null;
        store.ensure("AAPL", FROM, TO, budget);
        assertEquals(2, calls.size(), "a failed attempt does not block the retry");
    }

    @Test
    void aSymbolIsNotAskedAboutTwiceWithinAFewHours() {
        store.ensure("AAPL", FROM, TO, new CandleBudget(10));
        store.ensure("AAPL", FROM, TO, new CandleBudget(10));

        assertEquals(1, calls.size());
    }
}
