package org.example.trade_executor.marketdata;

import org.example.backend.mapper.InstrumentMapper;
import org.example.trade_executor.client.LiveQuote;
import org.example.trade_executor.client.QuoteClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MarketDataPollerTest {

    @Mock
    private InstrumentMapper instrumentMapper;

    @Mock
    private QuoteClient quoteClient;

    @Mock
    private MarketDataEventProducer marketDataEventProducer;

    private MutableClock clock;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-09-18T00:00:00Z"));
    }

    @Test
    void batchOfUpToTwentyFiveSymbolsUsesOneQuoteRequestPerBatch() {
        List<String> symbols = new ArrayList<>();
        for (int i = 1; i <= 26; i++) {
            symbols.add("SYM" + i);
        }

        when(instrumentMapper.selectSymbolsForMarketPolling()).thenReturn(symbols);
        when(quoteClient.getQuotes(anyCollection())).thenReturn(Map.of());

        MarketDataPoller poller = new MarketDataPoller(
                instrumentMapper,
                quoteClient,
                marketDataEventProducer,
                60,
                "",
                clock);

        poller.poll();

        ArgumentCaptor<Collection<String>> batchCaptor = ArgumentCaptor.forClass(Collection.class);
        verify(quoteClient, times(2)).getQuotes(batchCaptor.capture());

        List<Collection<String>> batches = batchCaptor.getAllValues();
        assertEquals(2, batches.size());
        assertTrue(batches.stream().allMatch(batch -> batch.size() <= 25));
        assertEquals(25, batches.get(0).size());
        assertEquals(1, batches.get(1).size());
    }

    @Test
    void eachQuoteIsPublishedAsItsOwnMessage() {
        when(instrumentMapper.selectSymbolsForMarketPolling()).thenReturn(List.of("AAPL", "MSFT"));

        Map<String, LiveQuote> quotes = new LinkedHashMap<>();
        quotes.put("AAPL", new LiveQuote("AAPL", new BigDecimal("190.12")));
        quotes.put("MSFT", new LiveQuote("MSFT", new BigDecimal("417.44")));
        when(quoteClient.getQuotes(anyCollection())).thenReturn(quotes);

        MarketDataPoller poller = new MarketDataPoller(
                instrumentMapper,
                quoteClient,
                marketDataEventProducer,
                60,
                "",
                clock);

        poller.poll();

        ArgumentCaptor<LiveQuote> quoteCaptor = ArgumentCaptor.forClass(LiveQuote.class);
        verify(marketDataEventProducer, times(2)).publish(quoteCaptor.capture(), org.mockito.ArgumentMatchers.any());

        List<String> publishedSymbols = quoteCaptor.getAllValues().stream().map(LiveQuote::symbol).toList();
        assertTrue(publishedSymbols.contains("AAPL"));
        assertTrue(publishedSymbols.contains("MSFT"));
    }

    @Test
    void configuredIntervalIsRaisedToStayInsideDailyQuota() {
        long effectiveIntervalSeconds = MarketDataPoller.calculateEffectiveIntervalSeconds(8, 30);
        long requestsPerDay = MarketDataPoller.requestsPerDay(8, effectiveIntervalSeconds);

        assertEquals(44L, effectiveIntervalSeconds);
        assertTrue(requestsPerDay <= 2000L);
    }

    @Test
    void intervalFloorIsEnforcedInCode() {
        when(instrumentMapper.selectSymbolsForMarketPolling()).thenReturn(List.of(
                "AAPL", "MSFT", "NVDA", "GOOG", "AMZN", "TSLA", "INFY.NS", "FX:EURUSD"));
        when(quoteClient.getQuotes(anyCollection())).thenReturn(Map.of());

        MarketDataPoller poller = new MarketDataPoller(
                instrumentMapper,
                quoteClient,
                marketDataEventProducer,
                30,
                "",
                clock);

        poller.poll();
        verify(quoteClient, times(1)).getQuotes(anyCollection());

        clock.advanceSeconds(30);
        poller.poll();
        verify(quoteClient, times(1)).getQuotes(anyCollection());

        clock.advanceSeconds(14);
        poller.poll();
        verify(quoteClient, times(2)).getQuotes(anyCollection());
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