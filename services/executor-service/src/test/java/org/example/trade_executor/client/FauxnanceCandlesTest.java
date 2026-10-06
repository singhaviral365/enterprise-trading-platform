package org.example.trade_executor.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Calls Fauxnance's /candles endpoint and parses its response shape. */
class FauxnanceCandlesTest {

    private static final String SAMPLE = """
            {
              "data": {
                "symbol": "AAPL",
                "interval": "1d",
                "currency": "USD",
                "candles": [
                  { "date": "2025-10-06", "open": 257.98, "high": 259.07, "low": 255.05, "close": 256.69,
                    "adjclose": 256.46, "volume": 44664100, "synthetic": false },
                  { "date": "2025-11-27", "open": 276.28, "high": 279.05, "low": 273.37, "close": 276.13,
                    "adjclose": 275.89, "volume": null, "synthetic": true },
                  { "date": "2025-11-28", "open": 277.26, "high": 279, "low": 275.98, "close": null,
                    "volume": 20135600, "synthetic": false }
                ]
              },
              "meta": { "asOf": "2026-10-06T00:00:00Z", "symbol": "AAPL", "source": "mixed" }
            }
            """;

    private HttpClient httpClient;
    private HttpResponse<String> response;
    private FauxnanceQuoteClient client;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(SAMPLE);
        httpClient = mock(HttpClient.class);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenAnswer(invocation -> response);

        client = new FauxnanceQuoteClient(
                httpClient, new ObjectMapper(), URI.create("https://fauxnance.test/v1/"), "secret", 1, 0L, Duration.ofSeconds(2));
    }

    @Test
    @SuppressWarnings("unchecked")
    void requestsTheDateRangeWithTheApiKey() throws Exception {
        client.getCandles("AAPL", LocalDate.of(2025, 10, 6), LocalDate.of(2026, 10, 6), "1d");

        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertEquals(
                "https://fauxnance.test/v1/candles/AAPL?from=2025-10-06&to=2026-10-06&interval=1d",
                request.getValue().uri().toString());
        assertEquals("secret", request.getValue().headers().firstValue("X-Api-Key").orElse(null));
    }

    @Test
    void parsesCandlesAndSkipsOnesWithoutAClose() {
        PriceHistory history = client.getCandles("AAPL", LocalDate.of(2025, 10, 6), LocalDate.of(2026, 10, 6), "1d");

        assertEquals("AAPL", history.symbol());
        assertEquals("USD", history.currency());
        assertEquals("1d", history.interval());
        assertEquals(2, history.candles().size());

        PriceHistory.Candle first = history.candles().get(0);
        assertEquals("2025-10-06", first.date());
        assertEquals(0, new BigDecimal("256.69").compareTo(first.close()));
        assertEquals(44664100L, first.volume());
        assertFalse(first.synthetic());

        PriceHistory.Candle holiday = history.candles().get(1);
        assertNull(holiday.volume());
        assertTrue(holiday.synthetic());
    }

    @Test
    void anUnknownSymbolGivesAnEmptyHistory() {
        when(response.statusCode()).thenReturn(404);

        PriceHistory history = client.getCandles("NOPE", LocalDate.of(2025, 10, 6), LocalDate.of(2026, 10, 6), "1d");

        assertEquals("NOPE", history.symbol());
        assertTrue(history.candles().isEmpty());
    }
}
