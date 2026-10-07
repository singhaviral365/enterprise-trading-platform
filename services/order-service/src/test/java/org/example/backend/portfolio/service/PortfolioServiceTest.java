package org.example.backend.portfolio.service;

import org.example.backend.dto.BalanceResponse;
import org.example.backend.dto.PositionResponse;
import org.example.backend.entities.Instrument;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.fx.ExchangeRateUnavailableException;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.portfolio.dto.PnlResponse;
import org.example.backend.portfolio.dto.PortfolioSummaryResponse;
import org.example.backend.portfolio.dto.PricedPositionResponse;
import org.example.backend.portfolio.dto.RealisedPnlResponse;
import org.example.backend.portfolio.exceptions.InvalidDateRangeException;
import org.example.backend.portfolio.exceptions.PortfolioAccessDeniedException;
import org.example.backend.portfolio.exceptions.PricingUnavailableException;
import org.example.backend.portfolio.ledger.RealisedPnlLedger;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.example.backend.portfolio.model.SymbolRealised;
import org.example.backend.portfolio.quote.ObservedQuote;
import org.example.backend.portfolio.quote.Quote;
import org.example.backend.portfolio.quote.QuoteCache;
import org.example.backend.service.TradeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PortfolioServiceTest {

    private static final long USER = 1000L;
    private static final long ACCOUNT = 7L;
    private static final Instant OBSERVED = Instant.parse("2026-10-07T11:59:30Z");
    /** One INR is this many USD in these tests. */
    private static final BigDecimal INR_TO_USD = new BigDecimal("0.012");

    private PortfolioAccess access;
    private TradeService trade;
    private InstrumentMapper instruments;
    private QuoteCache quotes;
    private CurrencyConversionService fx;
    private RealisedPnlReconciler reconciler;
    private RealisedPnlLedger ledger;
    private PortfolioService service;

    @BeforeEach
    void setUp() {
        access = mock(PortfolioAccess.class);
        trade = mock(TradeService.class);
        instruments = mock(InstrumentMapper.class);
        quotes = mock(QuoteCache.class);
        fx = mock(CurrencyConversionService.class);
        reconciler = mock(RealisedPnlReconciler.class);
        ledger = mock(RealisedPnlLedger.class);
        service = new PortfolioService(access, trade, instruments, quotes, fx, reconciler, ledger);

        when(trade.getBalance(ACCOUNT)).thenReturn(new BalanceResponse(
                ACCOUNT, new BigDecimal("1000.00"), "USD", OffsetDateTime.parse("2026-10-07T12:00:00Z")));
        when(ledger.total(eq(ACCOUNT), any(), any())).thenReturn(new BigDecimal("100.00"));
        when(fx.convert(any(), anyString(), anyString())).thenAnswer(invocation -> {
            BigDecimal amount = invocation.getArgument(0);
            String from = invocation.getArgument(1);
            String to = invocation.getArgument(2);
            if (from.equals(to)) {
                return amount;
            }
            if (from.equals("INR") && to.equals("USD")) {
                return amount.multiply(INR_TO_USD);
            }
            throw new ExchangeRateUnavailableException("No exchange rate for " + from + " -> " + to);
        });
    }

    // ---------------------------------------------------------------- helpers

    private void holdings(PositionResponse... positions) {
        when(trade.getPositions(ACCOUNT)).thenReturn(List.of(positions));
    }

    private static PositionResponse position(String symbol, int quantity, String averageCost) {
        return new PositionResponse(ACCOUNT, symbol, symbol + " Inc", null, quantity, new BigDecimal(averageCost));
    }

    private static ObservedQuote quote(String symbol, String price, String currency, String previousClose, boolean stale) {
        return new ObservedQuote(
                new Quote(symbol, new BigDecimal(price), currency,
                        previousClose == null ? null : new BigDecimal(previousClose), OBSERVED, false),
                OBSERVED,
                stale);
    }

    private void prices(ObservedQuote... observed) {
        Map<String, ObservedQuote> map = new LinkedHashMap<>();
        for (ObservedQuote quote : observed) {
            map.put(quote.quote().symbol(), quote);
        }
        when(quotes.lookup(anyCollection())).thenReturn(map);
    }

    private void instrumentIn(String symbol, String currency) {
        when(instruments.selectInstrumentByTicker(symbol)).thenReturn(Optional.of(new Instrument(
                1, symbol, symbol, InstrumentAssetClass.EQUITY, InstrumentStatus.TRADING, currency, null)));
    }

    // ---------------------------------------------------------------- positions are priced from a live quote

    @Test
    void pricesPositionsFromALiveQuote() {
        holdings(position("AAPL", 10, "228.40"));
        prices(quote("AAPL", "232.71", "USD", "230.00", false));

        PricedPositionResponse row = service.positions(USER, ACCOUNT, null).get(0);

        assertEquals("AAPL", row.symbol());
        assertEquals(10, row.quantity());
        assertEquals(new BigDecimal("2284.00"), row.costBasis(), "quantity * average cost");
        assertEquals(new BigDecimal("232.7100"), row.lastPrice());
        assertEquals(new BigDecimal("2327.10"), row.marketValue(), "quantity * last price");
        assertEquals(new BigDecimal("43.10"), row.unrealisedPnl(), "market value - cost basis");
        assertEquals(new BigDecimal("1.89"), row.unrealisedPnlPercent());
        assertEquals(new BigDecimal("230.0000"), row.previousClose());
        assertEquals(new BigDecimal("27.10"), row.dayPnl(), "10 * (232.71 - 230.00)");
        assertEquals(new BigDecimal("1.18"), row.dayPnlPercent());
        assertEquals(OBSERVED.atOffset(ZoneOffset.UTC), row.priceAsOf(), "every priced figure says when it was observed");
        assertFalse(row.stale());
        assertEquals("USD", row.currency());
    }

    @Test
    void theSummaryAddsUpCashMarketValueCostBasisAndTheTotals() {
        holdings(position("AAPL", 10, "228.40"), position("GOOGL", 5, "340.00"));
        prices(quote("AAPL", "232.71", "USD", "230.00", false), quote("GOOGL", "346.47", "USD", "345.00", false));

        PortfolioSummaryResponse summary = service.summary(USER, ACCOUNT);

        assertEquals("USD", summary.baseCurrency());
        assertEquals(new BigDecimal("1000.00"), summary.cashBalance());
        assertEquals(new BigDecimal("4059.45"), summary.marketValue(), "2327.10 + 1732.35");
        assertEquals(new BigDecimal("3984.00"), summary.costBasis(), "2284.00 + 1700.00");
        assertEquals(new BigDecimal("75.45"), summary.unrealisedPnl());
        assertEquals(new BigDecimal("1.89"), summary.unrealisedPnlPercent());
        assertEquals(new BigDecimal("100.00"), summary.realisedPnl(), "from the ledger, not from any price");
        assertEquals(new BigDecimal("5059.45"), summary.totalValue(), "cash + market value");
        assertEquals(2, summary.positionCount());
        assertFalse(summary.partial());
        assertEquals(new BigDecimal("34.45"), summary.dayPnl(), "27.10 + 7.35");
        assertEquals(OBSERVED.atOffset(ZoneOffset.UTC), summary.asOf());
        verify(reconciler).reconcileAccount(ACCOUNT);
    }

    // ---------------------------------------------------------------- partial and unavailable

    @Test
    void aPartialAnswerOmitsThePriceAndMarksIt() {
        holdings(position("AAPL", 10, "228.40"), position("INFY.NS", 40, "19.00"));
        prices(quote("AAPL", "232.71", "USD", "230.00", false));

        List<PricedPositionResponse> rows = service.positions(USER, ACCOUNT, null);
        PricedPositionResponse unpriced = rows.get(1);

        assertEquals("INFY.NS", unpriced.symbol());
        assertNull(unpriced.lastPrice());
        assertNull(unpriced.marketValue());
        assertNull(unpriced.unrealisedPnl());
        assertNull(unpriced.priceAsOf());
        assertTrue(unpriced.stale(), "an instrument that could not be priced is stale");
        assertEquals(new BigDecimal("760.00"), unpriced.costBasis(), "cost basis is still known");

        PortfolioSummaryResponse summary = service.summary(USER, ACCOUNT);
        assertTrue(summary.partial());
        assertEquals(new BigDecimal("2327.10"), summary.marketValue(), "only what could be priced");
        assertEquals(new BigDecimal("3044.00"), summary.costBasis(), "every holding's cost");
        assertEquals(new BigDecimal("3327.10"), summary.totalValue(), "cash + priced market value: understated, and marked partial");
        assertEquals(new BigDecimal("43.10"), summary.unrealisedPnl(), "over the priced positions");
    }

    @Test
    void noPriceForAnySymbolIsTheServiceUnavailableCode() {
        holdings(position("AAPL", 10, "228.40"), position("GOOGL", 5, "340.00"));
        prices();

        assertThrows(PricingUnavailableException.class, () -> service.summary(USER, ACCOUNT));
        assertThrows(PricingUnavailableException.class, () -> service.positions(USER, ACCOUNT, null));
        assertThrows(PricingUnavailableException.class, () -> service.pnl(USER, ACCOUNT, null, null, false));
    }

    @Test
    void anAccountThatHoldsNothingNeedsNoPriceAndIsNotUnavailable() {
        holdings();

        PortfolioSummaryResponse summary = service.summary(USER, ACCOUNT);

        assertEquals(new BigDecimal("1000.00"), summary.totalValue());
        assertEquals(0, summary.positionCount());
        assertFalse(summary.partial());
        assertNull(summary.dayPnl());
        verifyNoInteractions(quotes);
    }

    // ---------------------------------------------------------------- currency

    @Test
    void aHoldingInAnotherCurrencyIsConvertedToTheAccountCurrencyBeforeItIsSummed() {
        instrumentIn("INFY.NS", "INR");
        holdings(position("AAPL", 10, "228.40"), position("INFY.NS", 40, "12.00"));
        prices(quote("AAPL", "232.71", "USD", null, false), quote("INFY.NS", "1013.85", "INR", "1020.50", false));

        List<PricedPositionResponse> rows = service.positions(USER, ACCOUNT, null);
        PricedPositionResponse infosys = rows.get(1);

        assertEquals(new BigDecimal("12.1662"), infosys.lastPrice(), "1013.85 INR at 0.012, in the account currency");
        assertEquals(new BigDecimal("486.65"), infosys.marketValue());
        assertEquals(new BigDecimal("6.65"), infosys.unrealisedPnl(), "486.65 - (40 * 12.00)");
        assertEquals("INR", infosys.currency(), "the instrument's own currency, informational");

        PortfolioSummaryResponse summary = service.summary(USER, ACCOUNT);
        assertEquals(new BigDecimal("2813.75"), summary.marketValue(), "2327.10 + 486.65, one currency");
    }

    @Test
    void aCurrencyThatCannotBeConvertedMakesThatPositionUnpricedNotTheWholePortfolio() {
        holdings(position("AAPL", 10, "228.40"), position("XYZ", 3, "10.00"));
        prices(quote("AAPL", "232.71", "USD", null, false), quote("XYZ", "50.00", "ZZZ", null, false));

        List<PricedPositionResponse> rows = service.positions(USER, ACCOUNT, null);

        assertNull(rows.get(1).lastPrice());
        assertTrue(rows.get(1).stale());
        assertTrue(service.summary(USER, ACCOUNT).partial());
    }

    @Test
    void ifNothingAtAllCanBeConvertedThePortfolioIsUnavailable() {
        holdings(position("XYZ", 3, "10.00"));
        prices(quote("XYZ", "50.00", "ZZZ", null, false));

        assertThrows(PricingUnavailableException.class, () -> service.summary(USER, ACCOUNT));
    }

    // ---------------------------------------------------------------- staleness

    @Test
    void aStaleQuoteIsServedAndMarkedNotHidden() {
        holdings(position("AAPL", 10, "228.40"));
        prices(quote("AAPL", "232.71", "USD", null, true));

        PricedPositionResponse row = service.positions(USER, ACCOUNT, null).get(0);

        assertEquals(new BigDecimal("2327.10"), row.marketValue(), "the number is still served");
        assertTrue(row.stale(), "and it says it is old");
        assertNotNullAsOf(row);
    }

    private static void assertNotNullAsOf(PricedPositionResponse row) {
        assertEquals(OBSERVED.atOffset(ZoneOffset.UTC), row.priceAsOf());
    }

    // ---------------------------------------------------------------- day P&L

    @Test
    void dayPnlIsNullNotZeroWhenThePreviousCloseIsUnknown() {
        holdings(position("AAPL", 10, "228.40"));
        prices(quote("AAPL", "232.71", "USD", null, false));

        assertNull(service.positions(USER, ACCOUNT, null).get(0).dayPnl());
        assertNull(service.summary(USER, ACCOUNT).dayPnl());
    }

    @Test
    void theSummaryDayPnlCoversOnlyThePositionsThatHaveAPreviousClose() {
        holdings(position("AAPL", 10, "228.40"), position("GOOGL", 5, "340.00"));
        prices(quote("AAPL", "232.71", "USD", "230.00", false), quote("GOOGL", "346.47", "USD", null, false));

        assertEquals(new BigDecimal("27.10"), service.summary(USER, ACCOUNT).dayPnl());
    }

    // ---------------------------------------------------------------- the symbol filter

    @Test
    void theSymbolFilterPricesOnlyThatHolding() {
        holdings(position("AAPL", 10, "228.40"), position("GOOGL", 5, "340.00"));
        prices(quote("AAPL", "232.71", "USD", null, false));

        List<PricedPositionResponse> rows = service.positions(USER, ACCOUNT, "aapl");

        assertEquals(1, rows.size());
        assertEquals("AAPL", rows.get(0).symbol());
        verify(quotes).lookup(List.of("AAPL"));
    }

    @Test
    void aSymbolNotHeldIsAnEmptyListAndCostsNoQuote() {
        holdings(position("AAPL", 10, "228.40"));

        assertTrue(service.positions(USER, ACCOUNT, "TSLA").isEmpty());
        verifyNoInteractions(quotes);
    }

    @Test
    void aClosedOutPositionIsNotListed() {
        holdings(position("AAPL", 0, "228.40"), position("GOOGL", 5, "340.00"));
        prices(quote("GOOGL", "346.47", "USD", null, false));

        assertEquals(List.of("GOOGL"), service.positions(USER, ACCOUNT, null).stream().map(PricedPositionResponse::symbol).toList());
    }

    // ---------------------------------------------------------------- profit and loss

    @Test
    void pnlAddsRealisedFromTheLedgerToUnrealisedFromTheQuote() {
        holdings(position("AAPL", 10, "228.40"));
        prices(quote("AAPL", "232.71", "USD", "230.00", false));

        PnlResponse pnl = service.pnl(USER, ACCOUNT, null, null, false);

        assertEquals(new BigDecimal("100.00"), pnl.realisedPnl());
        assertEquals(new BigDecimal("43.10"), pnl.unrealisedPnl());
        assertEquals(new BigDecimal("143.10"), pnl.totalPnl());
        assertEquals(new BigDecimal("27.10"), pnl.dayPnl());
        assertNull(pnl.bySymbol(), "the breakdown is only there when asked for");
    }

    @Test
    void theRealisedFigureIsBoundedByTheDatesButUnrealisedIsAlwaysNow() {
        holdings(position("AAPL", 10, "228.40"));
        prices(quote("AAPL", "232.71", "USD", null, false));

        PnlResponse pnl = service.pnl(USER, ACCOUNT, LocalDate.parse("2026-09-01"), LocalDate.parse("2026-10-19"), false);

        verify(ledger).total(
                ACCOUNT,
                OffsetDateTime.parse("2026-09-01T00:00:00Z"),
                OffsetDateTime.parse("2026-10-20T00:00:00Z"));
        assertEquals(LocalDate.parse("2026-09-01"), pnl.from());
        assertEquals(LocalDate.parse("2026-10-19"), pnl.to());
        assertEquals(new BigDecimal("43.10"), pnl.unrealisedPnl());
    }

    @Test
    void aStartLaterThanTheEndIsInvalidInput() {
        assertThrows(InvalidDateRangeException.class,
                () -> service.pnl(USER, ACCOUNT, LocalDate.parse("2026-10-19"), LocalDate.parse("2026-09-01"), false));
    }

    @Test
    void theBreakdownJoinsRealisedAndUnrealisedBySymbol() {
        holdings(position("AAPL", 10, "228.40"));
        prices(quote("AAPL", "232.71", "USD", null, false));
        when(ledger.bySymbol(eq(ACCOUNT), any(), any())).thenReturn(List.of(
                new SymbolRealised("AAPL", new BigDecimal("100.00")),
                new SymbolRealised("TSLA", new BigDecimal("5.00"))));

        PnlResponse pnl = service.pnl(USER, ACCOUNT, null, null, true);

        assertEquals(2, pnl.bySymbol().size());
        assertEquals("AAPL", pnl.bySymbol().get(0).symbol());
        assertEquals(new BigDecimal("100.00"), pnl.bySymbol().get(0).realisedPnl());
        assertEquals(new BigDecimal("43.10"), pnl.bySymbol().get(0).unrealisedPnl());
        assertEquals(new BigDecimal("143.10"), pnl.bySymbol().get(0).totalPnl());
        assertEquals("TSLA", pnl.bySymbol().get(1).symbol());
        assertEquals(new BigDecimal("0.00"), pnl.bySymbol().get(1).unrealisedPnl());
        assertEquals(new BigDecimal("5.00"), pnl.bySymbol().get(1).totalPnl(), "sold out: realised only");
    }

    // ---------------------------------------------------------------- realised alone needs no price

    @Test
    void realisedProfitAndLossIsAnsweredWithoutAnyPriceOrPosition() {
        RealisedPnlResponse response = service.realised(USER, ACCOUNT, null, null, false);

        assertEquals(new BigDecimal("100.00"), response.realisedPnl());
        assertEquals("USD", response.baseCurrency());
        assertNull(response.bySymbol());
        verifyNoInteractions(quotes, fx);
        verify(trade, never()).getPositions(anyLong());
        verify(reconciler).reconcileAccount(ACCOUNT);
    }

    @Test
    void realisedCanBeBrokenDownBySymbolAndBoundedByDates() {
        when(ledger.bySymbol(eq(ACCOUNT), any(), any())).thenReturn(List.of(
                new SymbolRealised("AAPL", new BigDecimal("100.00")), new SymbolRealised("TSLA", new BigDecimal("-5.00"))));

        RealisedPnlResponse response = service.realised(
                USER, ACCOUNT, LocalDate.parse("2026-09-01"), LocalDate.parse("2026-10-19"), true);

        assertEquals(2, response.bySymbol().size());
        assertEquals("TSLA", response.bySymbol().get(1).symbol());
        assertEquals(new BigDecimal("-5.00"), response.bySymbol().get(1).realisedPnl());
        verify(ledger).total(ACCOUNT, OffsetDateTime.parse("2026-09-01T00:00:00Z"), OffsetDateTime.parse("2026-10-20T00:00:00Z"));
    }

    @Test
    void realisedRefusesAStartLaterThanTheEnd() {
        assertThrows(InvalidDateRangeException.class,
                () -> service.realised(USER, ACCOUNT, LocalDate.parse("2026-10-19"), LocalDate.parse("2026-09-01"), false));
    }

    @Test
    void realisedChecksOwnershipBeforeReadingAnything() {
        doThrow(new PortfolioAccessDeniedException(ACCOUNT)).when(access).require(USER, ACCOUNT);

        assertThrows(PortfolioAccessDeniedException.class, () -> service.realised(USER, ACCOUNT, null, null, true));

        verifyNoInteractions(trade, quotes, ledger, reconciler);
    }

    // ---------------------------------------------------------------- access comes first

    @Test
    void nothingIsReadBeforeTheOwnershipCheckPasses() {
        doThrow(new PortfolioAccessDeniedException(ACCOUNT)).when(access).require(USER, ACCOUNT);

        assertThrows(PortfolioAccessDeniedException.class, () -> service.summary(USER, ACCOUNT));
        assertThrows(PortfolioAccessDeniedException.class, () -> service.positions(USER, ACCOUNT, null));
        assertThrows(PortfolioAccessDeniedException.class, () -> service.pnl(USER, ACCOUNT, null, null, true));

        verifyNoInteractions(trade, quotes, ledger, reconciler);
        verify(trade, never()).getBalance(anyLong());
    }
}
