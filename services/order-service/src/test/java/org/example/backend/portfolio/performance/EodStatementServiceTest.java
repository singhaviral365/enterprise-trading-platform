package org.example.backend.portfolio.performance;

import org.example.backend.entities.Account;
import org.example.backend.entities.Instrument;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.enums.OrderSide;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.fx.ExchangeRateUnavailableException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.example.backend.portfolio.mapper.PerformanceMapper;
import org.example.backend.portfolio.mapper.PortfolioMapper;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * One account, opened on 1 October 2026 with 10,000, that buys 10 AAPL at 100 on Friday 2 October. "Now" is 7 October, so the
 * closed days are 1 to 6 October (Saturday and Sunday are 3 and 4).
 */
class EodStatementServiceTest {

    private static final long ACCOUNT = 7L;
    private static final LocalDate OPENED = LocalDate.of(2026, 10, 1);

    private AccountMapper accounts;
    private PortfolioMapper portfolio;
    private PerformanceMapper performance;
    private InstrumentMapper instruments;
    private CandleStore candles;
    private RealisedPnlReconciler reconciler;
    private CurrencyConversionService fx;
    private CandleBudget budget;

    private Account account;
    private final List<FilledOrder> fills = new ArrayList<>();
    private final List<HoldingSnapshot> holdings = new ArrayList<>();

    private static DailyCandle candle(String symbol, String date, String close, boolean synthetic) {
        BigDecimal value = new BigDecimal(close);
        return new DailyCandle(symbol, LocalDate.parse(date), value, value, "USD", synthetic);
    }

    private static Account account(AccountStatus status, String balance, String currency) {
        return new Account(7, "ACC000000007", OPENED, new BigDecimal(balance), new BigDecimal(balance), status, currency, 1L, null, null, 1000);
    }

    private static FilledOrder fill(long id, String symbol, OrderSide side, long quantity, String price, String at) {
        return new FilledOrder(id, symbol, side, quantity, new BigDecimal(price), OffsetDateTime.parse(at));
    }

    private EodStatementService service(int healDays) {
        return new EodStatementService(accounts, portfolio, performance, instruments, candles, reconciler, fx, healDays,
                Clock.fixed(Instant.parse("2026-10-07T01:30:00Z"), ZoneOffset.UTC));
    }

    private void instrument(String symbol, String currency) {
        when(instruments.selectInstrumentByTicker(symbol)).thenReturn(Optional.of(
                new Instrument(1, symbol, symbol, InstrumentAssetClass.EQUITY, InstrumentStatus.TRADING, currency, null)));
    }

    private void closes(String symbol, DailyCandle... rows) {
        when(candles.read(eq(symbol), any(LocalDate.class), any(LocalDate.class))).thenReturn(List.of(rows));
    }

    /** Every statement that was written, by date. */
    private record Written(LocalDate date, BigDecimal total, BigDecimal nav, BigDecimal netFlow, BigDecimal realised, boolean estimated) {
    }

    private List<Written> written() {
        ArgumentCaptor<LocalDate> date = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<BigDecimal> total = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<BigDecimal> realised = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<BigDecimal> flow = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<BigDecimal> nav = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<Boolean> estimated = ArgumentCaptor.forClass(Boolean.class);
        verify(performance, org.mockito.Mockito.atLeast(0)).upsertNav(
                anyLong(), date.capture(), any(), any(), total.capture(), any(), any(), realised.capture(), flow.capture(), any(),
                any(), nav.capture(), estimated.capture());
        List<Written> rows = new ArrayList<>();
        for (int i = 0; i < date.getAllValues().size(); i++) {
            rows.add(new Written(date.getAllValues().get(i), total.getAllValues().get(i), nav.getAllValues().get(i),
                    flow.getAllValues().get(i), realised.getAllValues().get(i), estimated.getAllValues().get(i)));
        }
        return rows;
    }

    private Written on(List<Written> rows, String date) {
        return rows.stream().filter(row -> row.date().equals(LocalDate.parse(date))).findFirst().orElseThrow();
    }

    @BeforeEach
    void setUp() {
        accounts = mock(AccountMapper.class);
        portfolio = mock(PortfolioMapper.class);
        performance = mock(PerformanceMapper.class);
        instruments = mock(InstrumentMapper.class);
        candles = mock(CandleStore.class);
        reconciler = mock(RealisedPnlReconciler.class);
        fx = mock(CurrencyConversionService.class);
        budget = new CandleBudget(50);

        account = account(AccountStatus.ACTIVE, "9000", "USD");
        when(accounts.selectAccountById(7)).thenReturn(Optional.of(account));
        fills.add(fill(1, "AAPL", OrderSide.BUY, 10, "100", "2026-10-02T14:00:00Z"));
        holdings.add(new HoldingSnapshot("AAPL", 10, new BigDecimal("100")));
        when(portfolio.selectFilledOrders(ACCOUNT)).thenReturn(fills);
        when(portfolio.selectHoldings(ACCOUNT)).thenReturn(holdings);
        when(performance.selectNav(eq(ACCOUNT), any(), any())).thenReturn(List.of());
        when(performance.selectRealisedByDay(ACCOUNT)).thenReturn(List.of());
        instrument("AAPL", "USD");
        closes("AAPL", candle("AAPL", "2026-10-02", "100", false), candle("AAPL", "2026-10-05", "110", false),
                candle("AAPL", "2026-10-06", "110", false));
    }

    @Test
    void writesEveryClosedDayButNeverToday() {
        int count = service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        assertEquals(6, count);
        assertEquals(LocalDate.of(2026, 10, 1), rows.get(0).date());
        assertEquals(LocalDate.of(2026, 10, 6), rows.get(5).date());
        assertTrue(rows.stream().noneMatch(row -> row.date().equals(LocalDate.of(2026, 10, 7))));
    }

    @Test
    void theOpeningCashIsDerivedAndTheFirstDayIsTheFundingAtANavOfOneThousand() {
        service(5).build(ACCOUNT, budget);

        Written first = on(written(), "2026-10-01");
        assertEquals(0, first.total().compareTo(new BigDecimal("10000")));
        assertEquals(0, first.nav().compareTo(new BigDecimal("1000")));
        assertEquals(0, first.netFlow().compareTo(new BigDecimal("10000")));
    }

    @Test
    void aBuyDoesNotMoveTheNavAndAPriceRiseDoes() {
        service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        assertEquals(0, on(rows, "2026-10-02").nav().compareTo(new BigDecimal("1000")), "swapping cash for shares changes nothing");
        assertEquals(0, on(rows, "2026-10-05").total().compareTo(new BigDecimal("10100")));
        assertEquals(0, on(rows, "2026-10-05").nav().compareTo(new BigDecimal("1010")));
    }

    @Test
    void aWeekendIsValuedAtFridaysClose() {
        service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        assertEquals(0, on(rows, "2026-10-03").total().compareTo(on(rows, "2026-10-02").total()));
        assertEquals(0, on(rows, "2026-10-04").total().compareTo(new BigDecimal("10000")));
        assertFalse(on(rows, "2026-10-04").estimated(), "a weekend is not a gap");
    }

    @Test
    void aSyntheticCloseMarksThatDayEstimatedAndTheNextRealOneDoesNot() {
        closes("AAPL", candle("AAPL", "2026-10-02", "100", false), candle("AAPL", "2026-10-05", "110", true),
                candle("AAPL", "2026-10-06", "112", false));

        service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        assertFalse(on(rows, "2026-10-02").estimated());
        assertTrue(on(rows, "2026-10-05").estimated());
        assertFalse(on(rows, "2026-10-06").estimated());
    }

    @Test
    void aHoldingWithNoPriceAtAllIsCarriedAtCostAndTheDayIsEstimated() {
        closes("AAPL");

        service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        assertEquals(0, on(rows, "2026-10-05").total().compareTo(new BigDecimal("10000")), "no move without a price");
        assertTrue(on(rows, "2026-10-05").estimated());
    }

    @Test
    void aCloseOlderThanALongWeekendIsAGapAndIsEstimated() {
        closes("AAPL", candle("AAPL", "2026-10-02", "100", false));

        service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        assertFalse(on(rows, "2026-10-06").estimated(), "four days back is still a weekend and a holiday");
        closes("AAPL", candle("AAPL", "2026-09-28", "100", false));
        // Re-run against a fresh mapper so the earlier writes are not counted again.
        performance = mock(PerformanceMapper.class);
        when(performance.selectNav(eq(ACCOUNT), any(), any())).thenReturn(List.of());
        when(performance.selectRealisedByDay(ACCOUNT)).thenReturn(List.of());
        service(5).build(ACCOUNT, budget);
        assertTrue(on(written(), "2026-10-06").estimated(), "eight days back is a gap");
    }

    @Test
    void aHoldingInAnotherCurrencyIsConvertedWithThatDaysRateCandle() {
        account = account(AccountStatus.ACTIVE, "9000", "USD");
        when(accounts.selectAccountById(7)).thenReturn(Optional.of(account));
        instrument("AAPL", "EUR");
        closes("AAPL", candle("AAPL", "2026-10-02", "100", false), candle("AAPL", "2026-10-06", "100", false));
        closes("FX:EURUSD", candle("FX:EURUSD", "2026-10-02", "1.10", false), candle("FX:EURUSD", "2026-10-06", "1.20", false));

        service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        // 10 shares at 100 EUR, at 1.10 then 1.20 dollars per euro, plus 9,000 of cash.
        assertEquals(0, on(rows, "2026-10-02").total().compareTo(new BigDecimal("10100")));
        assertEquals(0, on(rows, "2026-10-06").total().compareTo(new BigDecimal("10200")));
        assertFalse(on(rows, "2026-10-06").estimated());
        verify(candles).ensure(eq("FX:EURUSD"), eq(LocalDate.of(2026, 10, 2)), eq(LocalDate.of(2026, 10, 6)), eq(budget));
    }

    @Test
    void aMissingDirectRateIsTriedInvertedBeforeAnythingIsGuessed() {
        instrument("AAPL", "EUR");
        closes("AAPL", candle("AAPL", "2026-10-02", "100", false));
        closes("FX:EURUSD");
        closes("FX:USDEUR", candle("FX:USDEUR", "2026-10-02", "0.80", false));

        service(5).build(ACCOUNT, budget);

        // 1 / 0.80 = 1.25 dollars per euro: 10 x 100 x 1.25 = 1,250, plus 9,000 of cash.
        assertEquals(0, on(written(), "2026-10-02").total().compareTo(new BigDecimal("10250")));
        assertFalse(on(written(), "2026-10-02").estimated());
    }

    @Test
    void withNoRateCandlesTodaysRateIsUsedAndTheDaysAreEstimated() {
        instrument("AAPL", "EUR");
        closes("AAPL", candle("AAPL", "2026-10-02", "100", false));
        closes("FX:EURUSD");
        closes("FX:USDEUR");
        when(fx.convert(BigDecimal.ONE, "EUR", "USD")).thenReturn(new BigDecimal("1.50"));

        service(5).build(ACCOUNT, budget);

        assertEquals(0, on(written(), "2026-10-02").total().compareTo(new BigDecimal("10500")));
        assertTrue(on(written(), "2026-10-02").estimated());
    }

    @Test
    void withNoRateAtAllTheHoldingIsCarriedAtCostAndTheDayIsEstimated() {
        instrument("AAPL", "EUR");
        closes("AAPL", candle("AAPL", "2026-10-02", "100", false));
        closes("FX:EURUSD");
        closes("FX:USDEUR");
        when(fx.convert(any(), anyString(), anyString())).thenThrow(new ExchangeRateUnavailableException("none"));

        service(5).build(ACCOUNT, budget);

        assertEquals(0, on(written(), "2026-10-02").total().compareTo(new BigDecimal("10000")));
        assertTrue(on(written(), "2026-10-02").estimated());
    }

    @Test
    void theCumulativeRealisedFigureAccumulatesFromTheLedgerByDay() {
        when(performance.selectRealisedByDay(ACCOUNT)).thenReturn(List.of(
                new DayRealised(LocalDate.of(2026, 10, 3), new BigDecimal("50")),
                new DayRealised(LocalDate.of(2026, 10, 5), new BigDecimal("-20"))));

        service(5).build(ACCOUNT, budget);

        List<Written> rows = written();
        assertEquals(0, on(rows, "2026-10-02").realised().compareTo(BigDecimal.ZERO));
        assertEquals(0, on(rows, "2026-10-03").realised().compareTo(new BigDecimal("50")));
        assertEquals(0, on(rows, "2026-10-06").realised().compareTo(new BigDecimal("30")));
        verify(reconciler).reconcileAccount(ACCOUNT);
    }

    @Test
    void aClosedAccountGetsNoHistoryAndTheVendorIsNotAsked() {
        when(accounts.selectAccountById(7)).thenReturn(Optional.of(account(AccountStatus.CLOSED, "9000", "USD")));

        assertEquals(0, service(5).build(ACCOUNT, budget));

        verify(candles, never()).ensure(anyString(), any(), any(), any());
        verify(performance, never()).upsertNav(anyLong(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    void anUnknownAccountOrOneOpenedTodayHasNoClosedDays() {
        when(accounts.selectAccountById(7)).thenReturn(Optional.empty());
        assertEquals(0, service(5).build(ACCOUNT, budget));

        when(accounts.selectAccountById(7)).thenReturn(Optional.of(new Account(
                7, "ACC000000007", LocalDate.of(2026, 10, 7), BigDecimal.TEN, BigDecimal.TEN, AccountStatus.ACTIVE, "USD", 1L, null, null, 1000)));
        assertEquals(0, service(5).build(ACCOUNT, budget));
    }

    @Test
    void ordersThatImplyANegativeOpeningBalanceAreSkippedNotGuessed() {
        // 9,000 now after selling 5,000 of shares means it started with 4,000 less than nothing... here: sells of 50,000 with 9,000 left.
        fills.clear();
        fills.add(fill(2, "AAPL", OrderSide.SELL, 500, "100", "2026-10-02T14:00:00Z"));

        assertEquals(0, service(5).build(ACCOUNT, budget));

        verify(performance, never()).upsertNav(anyLong(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    void daysAlreadyWrittenAreLeftAloneExceptTheLastFewWhichAreRewrittenToHeal() {
        List<NavRow> stored = new ArrayList<>();
        for (int day = 1; day <= 6; day++) {
            stored.add(new NavRow(LocalDate.of(2026, 10, day), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ONE, BigDecimal.ONE, false));
        }
        when(performance.selectNav(eq(ACCOUNT), any(), any())).thenReturn(stored);
        when(performance.selectLastNavDate(ACCOUNT)).thenReturn(LocalDate.of(2026, 10, 6));

        int count = service(3).build(ACCOUNT, budget);

        assertEquals(3, count, "the last three stored days are rewritten, the first three are not");
        List<LocalDate> dates = written().stream().map(Written::date).toList();
        assertEquals(List.of(LocalDate.of(2026, 10, 4), LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 6)), dates);
    }

    @Test
    void aNewDayIsWrittenWhenOnlyTheEarlierOnesAreStored() {
        List<NavRow> stored = List.of(
                new NavRow(LocalDate.of(2026, 10, 1), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ONE, BigDecimal.ONE, false));
        when(performance.selectNav(eq(ACCOUNT), any(), any())).thenReturn(stored);
        when(performance.selectLastNavDate(ACCOUNT)).thenReturn(LocalDate.of(2026, 10, 1));

        assertEquals(6, service(1).build(ACCOUNT, budget), "the one stored day heals and the five new ones are added");
    }

    @Test
    void theCandlesAreAskedForFromTheFirstDayTheInstrumentWasHeld() {
        service(5).build(ACCOUNT, budget);

        verify(candles).ensure("AAPL", LocalDate.of(2026, 10, 2), LocalDate.of(2026, 10, 6), budget);
    }
}
