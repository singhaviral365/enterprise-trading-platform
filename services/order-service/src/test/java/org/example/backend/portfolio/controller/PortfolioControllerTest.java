package org.example.backend.portfolio.controller;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.dto.BalanceResponse;
import org.example.backend.dto.PositionResponse;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.portfolio.ledger.RealisedPnlLedger;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.example.backend.portfolio.quote.ObservedQuote;
import org.example.backend.portfolio.quote.Quote;
import org.example.backend.portfolio.quote.QuoteCache;
import org.example.backend.portfolio.service.PortfolioAccess;
import org.example.backend.portfolio.service.PortfolioService;
import org.example.backend.security.AuthContext;
import org.example.backend.service.TradeService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The three routes end to end, through the real service and the real ownership check, with only the data sources
 * (positions, balance, quotes, ledger) stubbed.
 */
class PortfolioControllerTest {

    /** The user the token names, and the user that account 7 belongs to. */
    private static final long OWNER = 1000L;
    private static final long STRANGER = 2000L;
    private static final Instant OBSERVED = Instant.parse("2026-10-07T11:59:30Z");

    private AccountMapper accounts;
    private TradeService trade;
    private QuoteCache quotes;
    private RealisedPnlLedger ledger;
    private MockMvc mockMvc;
    private ListAppender<ILoggingEvent> logs;
    private Logger accessLogger;

    @BeforeEach
    void setUp() {
        accounts = mock(AccountMapper.class);
        trade = mock(TradeService.class);
        quotes = mock(QuoteCache.class);
        ledger = mock(RealisedPnlLedger.class);
        CurrencyConversionService fx = mock(CurrencyConversionService.class);
        when(fx.convert(any(), anyString(), anyString())).thenAnswer(invocation -> invocation.getArgument(0));

        when(accounts.accountExists(7)).thenReturn(true);
        when(accounts.selectAccountLinkedUserId(7)).thenReturn((int) OWNER);
        when(trade.getBalance(7L)).thenReturn(new BalanceResponse(7L, new BigDecimal("1000.00"), "USD", OffsetDateTime.now()));
        when(trade.getPositions(7L)).thenReturn(List.of(
                new PositionResponse(7L, "AAPL", "Apple", null, 10, new BigDecimal("228.40"))));
        when(quotes.lookup(anyCollection())).thenReturn(Map.of("AAPL", new ObservedQuote(
                new Quote("AAPL", new BigDecimal("232.71"), "USD", new BigDecimal("230.00"), OBSERVED, false), OBSERVED, false)));
        when(ledger.total(eq(7L), any(), any())).thenReturn(new BigDecimal("100.00"));

        PortfolioService service = new PortfolioService(
                new PortfolioAccess(accounts), trade, mock(InstrumentMapper.class), quotes, fx,
                mock(RealisedPnlReconciler.class), ledger);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new PortfolioController(service))
                .setControllerAdvice(new PortfolioExceptionHandler(), new ApiExceptionHandler())
                .build();

        accessLogger = (Logger) LoggerFactory.getLogger(PortfolioAccess.class);
        logs = new ListAppender<>();
        logs.start();
        accessLogger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        accessLogger.detachAppender(logs);
    }

    private static MockHttpServletRequestBuilder as(long userId, MockHttpServletRequestBuilder request) {
        return request.requestAttr(AuthContext.USER_ID_ATTRIBUTE, userId);
    }

    // ---------------------------------------------------------------- the routes

    @Test
    void theSummaryRouteReturnsTheContractsFields() throws Exception {
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(7))
                .andExpect(jsonPath("$.baseCurrency").value("USD"))
                .andExpect(jsonPath("$.cashBalance").value(1000.00))
                .andExpect(jsonPath("$.marketValue").value(2327.10))
                .andExpect(jsonPath("$.costBasis").value(2284.00))
                .andExpect(jsonPath("$.unrealisedPnl").value(43.10))
                .andExpect(jsonPath("$.realisedPnl").value(100.00))
                .andExpect(jsonPath("$.totalValue").value(3327.10))
                .andExpect(jsonPath("$.positionCount").value(1))
                .andExpect(jsonPath("$.partial").value(false))
                .andExpect(jsonPath("$.dayPnl").value(27.10))
                .andExpect(jsonPath("$.asOf").exists());
    }

    @Test
    void thePositionsRouteReturnsPricedHoldingsWithWhenAndWhetherStale() throws Exception {
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/positions")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].symbol").value("AAPL"))
                .andExpect(jsonPath("$[0].quantity").value(10))
                .andExpect(jsonPath("$[0].lastPrice").value(232.71))
                .andExpect(jsonPath("$[0].marketValue").value(2327.10))
                .andExpect(jsonPath("$[0].priceAsOf").value("2026-10-07T11:59:30Z"))
                .andExpect(jsonPath("$[0].stale").value(false))
                .andExpect(jsonPath("$[0].instrumentName").doesNotExist());
    }

    @Test
    void thePnlRouteOmitsTheBreakdownUnlessAskedAndIncludesItWhenAsked() throws Exception {
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/pnl")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.realisedPnl").value(100.00))
                .andExpect(jsonPath("$.unrealisedPnl").value(43.10))
                .andExpect(jsonPath("$.totalPnl").value(143.10))
                .andExpect(jsonPath("$.bySymbol").doesNotExist());

        when(ledger.bySymbol(eq(7L), any(), any())).thenReturn(List.of());
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/pnl").param("bySymbol", "true")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bySymbol[0].symbol").value("AAPL"))
                .andExpect(jsonPath("$.bySymbol[0].unrealisedPnl").value(43.10));
    }

    // ---------------------------------------------------------------- pricing unavailable

    @Test
    void noPriceForAnySymbolIsMkt503OnEveryRoute() throws Exception {
        when(quotes.lookup(anyCollection())).thenReturn(Map.of());

        for (String path : List.of("/api/v1/portfolio/7", "/api/v1/portfolio/7/positions", "/api/v1/portfolio/7/pnl")) {
            mockMvc.perform(as(OWNER, get(path)))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.errorCode").value("MKT-503"))
                    .andExpect(jsonPath("$.message").value("Pricing unavailable"));
        }
    }

    @Test
    void aPartialAnswerIsA200WithThePriceOmittedAndTheSummaryMarkedPartial() throws Exception {
        when(trade.getPositions(7L)).thenReturn(List.of(
                new PositionResponse(7L, "AAPL", "Apple", null, 10, new BigDecimal("228.40")),
                new PositionResponse(7L, "INFY.NS", "Infosys", null, 40, new BigDecimal("19.00"))));

        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.partial").value(true));
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/positions")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[1].symbol").value("INFY.NS"))
                .andExpect(jsonPath("$[1].lastPrice").value((Object) null))
                .andExpect(jsonPath("$[1].marketValue").value((Object) null))
                .andExpect(jsonPath("$[1].stale").value(true));
    }

    // ---------------------------------------------------------------- realised needs no price

    @Test
    void theRealisedRouteStillAnswersWhenPricingIsDown() throws Exception {
        when(quotes.lookup(anyCollection())).thenReturn(Map.of());
        when(ledger.bySymbol(eq(7L), any(), any())).thenReturn(List.of());

        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/realised")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(7))
                .andExpect(jsonPath("$.baseCurrency").value("USD"))
                .andExpect(jsonPath("$.realisedPnl").value(100.00))
                .andExpect(jsonPath("$.bySymbol").doesNotExist())
                .andExpect(jsonPath("$.asOf").exists());
        // The same moment the other routes say MKT-503.
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7")))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void theRealisedRouteHasAStartAndEndAndAnOptionalBreakdown() throws Exception {
        when(ledger.bySymbol(eq(7L), any(), any())).thenReturn(List.of(new org.example.backend.portfolio.model.SymbolRealised("AAPL", new BigDecimal("100.00"))));

        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/realised").param("from", "2026-09-01").param("to", "2026-10-19").param("bySymbol", "true")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2026-09-01"))
                .andExpect(jsonPath("$.bySymbol[0].symbol").value("AAPL"))
                .andExpect(jsonPath("$.bySymbol[0].realisedPnl").value(100.00));
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/realised").param("from", "2026-10-19").param("to", "2026-09-01")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    // ---------------------------------------------------------------- one account cannot read another's portfolio

    @Test
    void aForeignAccountIsForbiddenOnEveryRouteAndTheAttemptIsLogged() throws Exception {
        for (String path : List.of("/api/v1/portfolio/7", "/api/v1/portfolio/7/positions", "/api/v1/portfolio/7/pnl", "/api/v1/portfolio/7/realised")) {
            mockMvc.perform(as(STRANGER, get(path)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.errorCode").value("ACC-403"));
        }

        // Nothing was read for the stranger: not the balance, not the positions, not a quote.
        verifyNoInteractions(quotes, ledger);
        assertTrue(logs.list.stream().anyMatch(event -> event.getLevel() == Level.WARN
                        && event.getFormattedMessage().contains("user 2000") && event.getFormattedMessage().contains("account 7")),
                "a customer probing another customer's portfolio is logged");
        assertEquals(4, logs.list.stream().filter(event -> event.getLevel() == Level.WARN).count());
    }

    @Test
    void anAccountThatDoesNotExistIsNotFoundNotForbidden() throws Exception {
        when(accounts.accountExists(anyInt())).thenReturn(false);

        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/99")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void aRequestWithoutATokenIsRefusedBeforeAnythingIsRead() throws Exception {
        mockMvc.perform(get("/api/v1/portfolio/7"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(quotes, ledger);
    }

    // ---------------------------------------------------------------- invalid input

    @Test
    void aStartLaterThanTheEndIsVal422() throws Exception {
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/pnl").param("from", "2026-10-19").param("to", "2026-09-01")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    @Test
    void aDateThatIsNotADateIsVal422() throws Exception {
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/7/pnl").param("from", "yesterday")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    @Test
    void anAccountIdThatIsNotANumberIsVal422() throws Exception {
        mockMvc.perform(as(OWNER, get("/api/v1/portfolio/abc")))
                .andExpect(status().isUnprocessableEntity());
        verifyNoInteractions(quotes, ledger);
        org.mockito.Mockito.verify(accounts, org.mockito.Mockito.never()).accountExists(anyInt());
        org.mockito.Mockito.verify(trade, org.mockito.Mockito.never()).getBalance(anyLong());
    }
}
