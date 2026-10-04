package org.example.trade_executor.market;

import org.example.backend.entities.Instrument;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.mapper.InstrumentMapper;
import org.example.trade_executor.client.QuoteDetails;
import org.example.trade_executor.client.QuoteClient;
import org.example.trade_executor.client.QuoteUnavailableException;
import org.example.trade_executor.fx.CurrencyConversionService;
import org.example.trade_executor.fx.ExchangeRates;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MarketQuoteServiceTest {

    @Mock
    private InstrumentMapper instrumentMapper;

    @Mock
    private QuoteClient quoteClient;

    @Mock
    private CurrencyConversionService currencyConversionService;

    private MutableClock clock;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-09-30T08:00:00Z"));
    }

    @Test
    void returnsTradableInstrumentsWithLatestPrice() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(
                instrument(1, "AAPL", "Apple Inc"),
                instrument(2, "MSFT", "Microsoft Corp")));

        Map<String, QuoteDetails> quotes = new LinkedHashMap<>();
        quotes.put("AAPL", quote("AAPL", "189.12"));
        quotes.put("MSFT", quote("MSFT", "417.44"));
        when(quoteClient.getQuoteDetails(anyCollection())).thenReturn(quotes);

        MarketQuoteService service = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 30, clock);
        MarketBoard board = service.getBoard();

        assertEquals(2, board.quotes().size());
        assertEquals("AAPL", board.quotes().get(0).symbol());
        assertEquals(new BigDecimal("189.12"), board.quotes().get(0).price());
        assertFalse(board.stale());
    }

    @Test
    void servesCachedBoardInsideTtl() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(instrument(1, "AAPL", "Apple Inc")));

        when(quoteClient.getQuoteDetails(anyCollection()))
                .thenReturn(Map.of("AAPL", quote("AAPL", "189.12")))
                .thenReturn(Map.of("AAPL", quote("AAPL", "200.00")));

        MarketQuoteService service = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 30, clock);

        MarketBoard first = service.getBoard();
        clock.advanceSeconds(10);
        MarketBoard second = service.getBoard();

        assertEquals(first.asOf(), second.asOf());
        assertEquals(first.quotes().get(0).price(), second.quotes().get(0).price());
        verify(quoteClient, times(1)).getQuoteDetails(anyCollection());
    }

    @Test
    void returnsStaleSnapshotWhenRefreshFails() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(instrument(1, "AAPL", "Apple Inc")));

        when(quoteClient.getQuoteDetails(anyCollection()))
                .thenReturn(Map.of("AAPL", quote("AAPL", "189.12")))
                .thenThrow(new QuoteUnavailableException("AAPL", "downstream unavailable"));

        MarketQuoteService service = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 5, clock);

        MarketBoard fresh = service.getBoard();
        clock.advanceSeconds(6);
        MarketBoard stale = service.getBoard();

        assertFalse(fresh.stale());
        assertTrue(stale.stale());
        assertEquals(fresh.asOf(), stale.asOf());
        assertEquals(fresh.quotes().get(0).price(), stale.quotes().get(0).price());
    }

    @Test
    void throwsServiceUnavailableWhenFirstFetchFailsWithoutCache() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(instrument(1, "AAPL", "Apple Inc")));
        when(quoteClient.getQuoteDetails(anyCollection()))
                .thenThrow(new QuoteUnavailableException("AAPL", "downstream unavailable"));

        MarketQuoteService service = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 30, clock);

        assertThrows(ResponseStatusException.class, service::getBoard);
    }

    @Test
    void splitsSymbolsIntoFauxnanceSizedBatches() {
        List<Instrument> many = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            many.add(instrument(i + 1, String.format("S%02d", i), "Stock " + i));
        }
        when(instrumentMapper.selectTradableInstruments()).thenReturn(many);
        when(quoteClient.getQuoteDetails(anyCollection())).thenReturn(Map.of());

        new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 30, clock).getBoard();

        org.mockito.ArgumentCaptor<java.util.Collection<String>> batches =
                org.mockito.ArgumentCaptor.forClass(java.util.Collection.class);
        verify(quoteClient, times(2)).getQuoteDetails(batches.capture());
        assertEquals(25, batches.getAllValues().get(0).size());
        assertEquals(5, batches.getAllValues().get(1).size());
    }

    @Test
    void callsFauxnanceOncePerTtlDuringAnOutage() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(instrument(1, "AAPL", "Apple Inc")));
        when(quoteClient.getQuoteDetails(anyCollection()))
                .thenReturn(Map.of("AAPL", quote("AAPL", "189.12")))
                .thenThrow(new QuoteUnavailableException("AAPL", "downstream unavailable"));

        MarketQuoteService service = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 5, clock);
        service.getBoard();
        clock.advanceSeconds(6);
        service.getBoard();
        clock.advanceSeconds(1);
        MarketBoard stillStale = service.getBoard();

        assertTrue(stillStale.stale());
        verify(quoteClient, times(2)).getQuoteDetails(anyCollection());
    }

    @Test
    void skipsInstrumentsWithoutATicker() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(
                instrument(1, "AAPL", "Apple Inc"),
                new Instrument(2, null, "Broken row", InstrumentAssetClass.EQUITY, InstrumentStatus.TRADING)));
        when(quoteClient.getQuoteDetails(anyCollection())).thenReturn(Map.of());

        MarketBoard board = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 30, clock).getBoard();

        assertEquals(1, board.quotes().size());
        assertEquals("AAPL", board.quotes().get(0).symbol());
    }

    @Test
    void carriesIconCurrencyAndExchangeRatesOntoTheBoard() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(
                new Instrument(1, "AAPL", "Apple Inc", InstrumentAssetClass.EQUITY, InstrumentStatus.TRADING,
                        "USD", "/assets/icons/AAPL.svg"),
                new Instrument(2, "INFY.NS", "Infosys Ltd", InstrumentAssetClass.EQUITY, InstrumentStatus.TRADING,
                        "INR", "/assets/icons/INFY.NS.svg")));
        Map<String, QuoteDetails> quotes = new LinkedHashMap<>();
        quotes.put("AAPL", new QuoteDetails("AAPL", new BigDecimal("200.00"), Map.of("currency", "USD")));
        // The quote API did not report a currency for this one, so the instrument's own is used.
        quotes.put("INFY.NS", quote("INFY.NS", "1100.00"));
        when(quoteClient.getQuoteDetails(anyCollection())).thenReturn(quotes);
        when(currencyConversionService.currentRatesIfAvailable()).thenReturn(Optional.of(new ExchangeRates(
                "USD",
                Map.of("USD", BigDecimal.ONE, "INR", new BigDecimal("96.35")),
                clock.instant())));

        MarketBoard board = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 30, clock).getBoard();

        MarketQuote aapl = board.quotes().get(0);
        MarketQuote infy = board.quotes().get(1);
        assertEquals("/assets/icons/AAPL.svg", aapl.iconUrl());
        assertEquals("USD", aapl.currency());
        assertEquals("/assets/icons/INFY.NS.svg", infy.iconUrl());
        assertEquals("INR", infy.currency());
        assertEquals("USD", board.baseCurrency());
        assertEquals(new BigDecimal("96.35"), board.fxRates().get("INR"));
    }

    @Test
    void theBoardStillWorksWithoutExchangeRates() {
        when(instrumentMapper.selectTradableInstruments()).thenReturn(List.of(instrument(1, "AAPL", "Apple Inc")));
        when(quoteClient.getQuoteDetails(anyCollection())).thenReturn(Map.of("AAPL", quote("AAPL", "189.12")));
        when(currencyConversionService.currentRatesIfAvailable()).thenReturn(Optional.empty());

        MarketBoard board = new MarketQuoteService(instrumentMapper, quoteClient, currencyConversionService, 30, clock).getBoard();

        assertEquals(1, board.quotes().size());
        assertNull(board.fxRates());
        assertNull(board.baseCurrency());
    }

    private static QuoteDetails quote(String symbol, String price) {
        return new QuoteDetails(symbol, new BigDecimal(price), Map.of("symbol", symbol, "price", new BigDecimal(price)));
    }

    private static Instrument instrument(int id, String ticker, String name) {
        return new Instrument(id, ticker, name, InstrumentAssetClass.EQUITY, InstrumentStatus.TRADING);
    }

    private static final class MutableClock extends Clock {

        private Instant now;

        private MutableClock(Instant start) {
            this.now = start;
        }

        void advanceSeconds(long seconds) {
            now = now.plusSeconds(seconds);
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
