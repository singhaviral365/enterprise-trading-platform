package org.example.trade_executor.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Parses the real Fauxnance batch response shape into full quote details. */
class FauxnanceQuoteDetailsTest {

    /** Sample response from the Fauxnance /quotes endpoint (including an unknown symbol). */
    private static final String SAMPLE = """
            {
              "data": {
                "quotes": [
                  {
                    "symbol": "AAPL",
                    "source": "cache",
                    "stale": false,
                    "quote": {
                      "symbol": "AAPL",
                      "price": 313.53,
                      "bid": 313.5,
                      "ask": 313.56,
                      "spreadBps": 1.8587,
                      "currency": "USD",
                      "change": 3.63,
                      "changePercent": 1.1713,
                      "previousClose": 309.9,
                      "asOf": "2026-08-26T16:13:24Z",
                      "marketState": "open"
                    }
                  },
                  {
                    "symbol": "FX:EURUSD",
                    "source": "upstream:frankfurter",
                    "stale": false,
                    "quote": {
                      "symbol": "FX:EURUSD",
                      "price": 1.1675,
                      "currency": "USD",
                      "change": 0.0012,
                      "changePercent": 0.1029,
                      "marketState": "open"
                    }
                  },
                  {
                    "symbol": "BAD",
                    "error": { "code": "SYMBOL_NOT_FOUND", "message": "Symbol was not recognized.", "details": {} }
                  }
                ]
              },
              "meta": { "asOf": "2026-08-26T16:13:24Z", "disclaimer": "Educational data. Not for investment use." }
            }
            """;

    private FauxnanceQuoteClient client;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(SAMPLE);
        HttpClient httpClient = mock(HttpClient.class);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenAnswer(invocation -> response);

        client = new FauxnanceQuoteClient(
                httpClient, new ObjectMapper(), URI.create("https://fauxnance.test/v1/"), "", 1, 0L, Duration.ofSeconds(2));
    }

    @Test
    void returnsEveryQuoteFieldPlusSourceAndStale() {
        Map<String, QuoteDetails> details = client.getQuoteDetails(List.of("AAPL", "FX:EURUSD", "BAD"));

        QuoteDetails apple = details.get("AAPL");
        assertEquals(0, new BigDecimal("313.53").compareTo(apple.price()));
        assertEquals(0, new BigDecimal("3.63").compareTo((BigDecimal) apple.fields().get("change")));
        assertEquals(0, new BigDecimal("1.1713").compareTo((BigDecimal) apple.fields().get("changePercent")));
        assertEquals("open", apple.fields().get("marketState"));
        assertEquals("USD", apple.fields().get("currency"));
        assertEquals("cache", apple.fields().get("source"));
        assertEquals(false, apple.fields().get("stale"));
        assertTrue(apple.fields().containsKey("bid"));
        assertTrue(apple.fields().containsKey("previousClose"));

        assertEquals("upstream:frankfurter", details.get("FX:EURUSD").fields().get("source"));
    }

    @Test
    void skipsSymbolsTheApiDidNotRecognise() {
        Map<String, QuoteDetails> details = client.getQuoteDetails(List.of("AAPL", "FX:EURUSD", "BAD"));

        assertEquals(2, details.size());
        assertFalse(details.containsKey("BAD"));
    }

    @Test
    void priceOnlyLookupStillWorksOnTheSameResponse() {
        Map<String, LiveQuote> quotes = client.getQuotes(List.of("AAPL", "FX:EURUSD", "BAD"));

        assertEquals(0, new BigDecimal("313.53").compareTo(quotes.get("AAPL").price()));
        assertFalse(quotes.containsKey("BAD"));
    }
}
