package org.example.backend.portfolio.performance;

import org.example.backend.entities.Account;
import org.example.backend.enums.AccountStatus;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.portfolio.dto.PerformanceResponse;
import org.example.backend.portfolio.exceptions.InvalidDateRangeException;
import org.example.backend.portfolio.exceptions.PerformanceDisabledException;
import org.example.backend.portfolio.exceptions.PortfolioAccessDeniedException;
import org.example.backend.portfolio.mapper.PerformanceMapper;
import org.example.backend.portfolio.service.PortfolioAccess;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PerformanceServiceTest {

    private static final long USER = 1000L;
    private static final long ACCOUNT = 7L;
    private static final LocalDate D = LocalDate.of(2026, 9, 1);

    private PortfolioAccess access;
    private PerformanceMapper mapper;
    private CandleStore candles;
    private NavJob job;
    private PerformanceService service;

    private static NavRow row(LocalDate date, String nav, String value, boolean estimated) {
        return new NavRow(date, BigDecimal.ZERO, new BigDecimal(value), new BigDecimal(value), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ONE, new BigDecimal(nav), estimated);
    }

    @BeforeEach
    void setUp() {
        access = mock(PortfolioAccess.class);
        mapper = mock(PerformanceMapper.class);
        candles = mock(CandleStore.class);
        job = mock(NavJob.class);
        AccountMapper accounts = mock(AccountMapper.class);
        when(accounts.selectAccountById(7)).thenReturn(Optional.of(new Account(
                7, "ACC000000007", LocalDate.of(2026, 1, 1), BigDecimal.TEN, BigDecimal.TEN, AccountStatus.ACTIVE, "EUR", 1L, null, null, 1000)));
        when(job.isEnabled()).thenReturn(true);
        when(job.benchmarks()).thenReturn(List.of("SPY"));
        service = new PerformanceService(access, mapper, candles, job, accounts);
    }

    @Test
    void returnsTheStoredHistoryWithItsSummaryAndTheCurrency() {
        when(mapper.selectNav(ACCOUNT, null, null)).thenReturn(List.of(
                row(D, "1000", "10000", false), row(D.plusDays(1), "1010", "10100", true)));

        PerformanceResponse response = service.curve(USER, ACCOUNT, null, null, null).orElseThrow();

        assertEquals("EUR", response.baseCurrency());
        assertEquals(2, response.points().size());
        assertEquals(D, response.availableFrom());
        assertTrue(response.estimated(), "one estimated day makes the range estimated");
        assertEquals(new BigDecimal("1.00"), response.summary().returnPct());
        assertNull(response.benchmark());
    }

    @Test
    void theFirstTimeItSaysBuildingAndStartsTheBuildInTheBackground() {
        when(mapper.selectNav(ACCOUNT, null, null)).thenReturn(List.of());
        when(job.buildInBackground(ACCOUNT)).thenReturn(true);

        assertTrue(service.curve(USER, ACCOUNT, null, null, null).isEmpty());
        verify(job).buildInBackground(ACCOUNT);
    }

    @Test
    void ifABuildFinishedRecentlyWithNothingItAnswersEmptyInsteadOfBuildingForever() {
        when(mapper.selectNav(ACCOUNT, null, null)).thenReturn(List.of());
        when(job.buildInBackground(ACCOUNT)).thenReturn(false);

        PerformanceResponse response = service.curve(USER, ACCOUNT, null, null, null).orElseThrow();

        assertTrue(response.points().isEmpty());
        assertNull(response.summary());
        assertNull(response.availableFrom());
    }

    @Test
    void theRangeNarrowsThePointsButNotWhenTheHistoryStarts() {
        when(mapper.selectNav(ACCOUNT, null, null)).thenReturn(List.of(
                row(D, "1000", "100", false), row(D.plusDays(1), "1001", "100", false), row(D.plusDays(2), "1002", "100", false)));

        PerformanceResponse response = service.curve(USER, ACCOUNT, D.plusDays(1), null, null).orElseThrow();

        assertEquals(2, response.points().size());
        assertEquals(D, response.availableFrom());
    }

    @Test
    void theBenchmarkIsRebasedToThe1000TheNavStartsAt() {
        when(mapper.selectNav(ACCOUNT, null, null)).thenReturn(List.of(row(D, "1000", "100", false), row(D.plusDays(2), "1010", "100", false)));
        when(candles.read("SPY", D, D.plusDays(2))).thenReturn(List.of(
                new DailyCandle("SPY", D, BigDecimal.TEN, new BigDecimal("500"), "USD", false),
                new DailyCandle("SPY", D.plusDays(2), BigDecimal.TEN, new BigDecimal("510"), "USD", false)));

        PerformanceResponse response = service.curve(USER, ACCOUNT, null, null, "spy").orElseThrow();

        assertEquals("SPY", response.benchmark().symbol());
        assertEquals(0, new BigDecimal("1000").compareTo(response.benchmark().points().get(0).nav()));
        assertEquals(0, new BigDecimal("1020").compareTo(response.benchmark().points().get(1).nav()));
    }

    @Test
    void onlyAConfiguredBenchmarkMayBeAskedFor() {
        assertThrows(InvalidDateRangeException.class, () -> service.curve(USER, ACCOUNT, null, null, "TSLA"));
    }

    @Test
    void aStartAfterTheEndIsRefused() {
        assertThrows(InvalidDateRangeException.class, () -> service.curve(USER, ACCOUNT, D.plusDays(5), D, null));
    }

    @Test
    void whenSwitchedOffItSaysSo() {
        when(job.isEnabled()).thenReturn(false);

        assertThrows(PerformanceDisabledException.class, () -> service.curve(USER, ACCOUNT, null, null, null));
        verify(mapper, never()).selectNav(anyLong(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void anotherCustomersAccountIsRefusedBeforeAnythingIsRead() {
        doThrow(new PortfolioAccessDeniedException(ACCOUNT)).when(access).require(USER, ACCOUNT);

        assertThrows(PortfolioAccessDeniedException.class, () -> service.curve(USER, ACCOUNT, null, null, null));

        verifyNoInteractions(mapper, candles);
    }
}
