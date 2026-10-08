package org.example.backend.signals.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Against a stubbed HttpClient: what is asked of Fauxnance, and how each answer is read. */
class FauxnanceSignalCandleSourceTest {

    private static final String KEY = "fauxnance-secret-key";
    private static final LocalDate FROM = LocalDate.parse("2026-07-09");
    private static final LocalDate TO = LocalDate.parse("2026-10-07");

    private HttpClient http;
    private FauxnanceSignalCandleSource source;

    @BeforeEach
    void setUp() {
        http = mock(HttpClient.class);
        source = new FauxnanceSignalCandleSource(http, new ObjectMapper(), "https://fauxnance.test/v1", KEY, Duration.ofSeconds(5));
    }

    @SuppressWarnings("unchecked")
    private void answers(int status, String body) throws IOException, InterruptedException {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    @Test
    void asksForADailyWindowWithTheKeyInAHeader() throws Exception {
        answers(200, "{\"data\":{\"candles\":[]}}");

        source.fetch("BRK.B", FROM, TO);

        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertEquals("https://fauxnance.test/v1/candles/BRK.B?from=2026-07-09&to=2026-10-07&interval=1d", request.getValue().uri().toString());
        assertEquals(KEY, request.getValue().headers().firstValue("X-Api-Key").orElseThrow());
        assertFalse(request.getValue().uri().toString().contains(KEY));
    }

    @Test
    void aSymbolWithSpecialCharactersIsEncodedInThePath() throws Exception {
        answers(200, "{\"data\":{\"candles\":[]}}");

        source.fetch("FX:EUR/USD", FROM, TO);

        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertTrue(request.getValue().uri().toString().contains("candles/FX%3AEUR%2FUSD?"), request.getValue().uri().toString());
    }

    @Test
    void readsTheDateTheCloseAndWhetherTheDayWasSynthetic() throws Exception {
        answers(200, """
                {"data":{"symbol":"AAPL","currency":"USD","candles":[
                  {"date":"2026-10-05","close":149.5,"adjclose":149.1,"synthetic":false},
                  {"date":"2026-10-06T00:00:00Z","close":"150.25","synthetic":true}]}}""");

        List<Candle> candles = source.fetch("AAPL", FROM, TO);

        assertEquals(2, candles.size());
        assertEquals(new Candle(LocalDate.parse("2026-10-05"), new BigDecimal("149.5"), false), candles.get(0));
        assertEquals(new Candle(LocalDate.parse("2026-10-06"), new BigDecimal("150.25"), true), candles.get(1));
    }

    @Test
    void rowsWithoutADateOrAPositiveCloseAreSkipped() {
        List<Candle> candles = source.parse("""
                {"data":{"candles":[
                  {"close":1},
                  {"date":"not-a-date","close":1},
                  {"date":"2026-10-05"},
                  {"date":"2026-10-05","close":0},
                  {"date":"2026-10-05","close":-3},
                  {"date":"2026-10-05","close":"abc"},
                  {"date":"2026-10-05","close":10}]}}""");

        assertEquals(1, candles.size());
        assertEquals(new BigDecimal("10"), candles.get(0).close());
    }

    @Test
    void aBodyWithNoCandlesOrNoBodyIsEmptyNotAnError() {
        assertTrue(source.parse(null).isEmpty());
        assertTrue(source.parse("  ").isEmpty());
        assertTrue(source.parse("{}").isEmpty());
        assertTrue(source.parse("{\"data\":{}}").isEmpty());
        assertTrue(source.parse("{\"data\":{\"candles\":\"none\"}}").isEmpty());
    }

    @Test
    void aBodyThatIsNotJsonIsAFailure() {
        assertThrows(CandleSourceException.class, () -> source.parse("<html>"));
    }

    @Test
    void anUnknownSymbolIsAnEmptyListAndAQuotaAnswerIsReportedAsQuota() throws Exception {
        answers(404, "");
        assertTrue(source.fetch("ZZZZ", FROM, TO).isEmpty());

        answers(429, "");
        CandleSourceException quota = assertThrows(CandleSourceException.class, () -> source.fetch("AAPL", FROM, TO));
        assertTrue(quota.isQuotaExceeded());

        answers(500, "");
        CandleSourceException failed = assertThrows(CandleSourceException.class, () -> source.fetch("AAPL", FROM, TO));
        assertFalse(failed.isQuotaExceeded());
        assertEquals("Fauxnance answered HTTP 500", failed.getMessage());
    }

    @Test
    void anUnreachableFauxnanceIsAFailureThatNamesNeitherTheUrlNorTheKey() throws Exception {
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("connect to https://fauxnance.test with " + KEY));

        CandleSourceException ex = assertThrows(CandleSourceException.class, () -> source.fetch("AAPL", FROM, TO));

        assertEquals("Fauxnance could not be reached", ex.getMessage());
        assertFalse(ex.getMessage().contains(KEY));
    }

    @Test
    void withNoAddressConfiguredNothingIsSent() throws Exception {
        source = new FauxnanceSignalCandleSource(http, new ObjectMapper(), " ", KEY, Duration.ofSeconds(5));

        assertThrows(CandleSourceException.class, () -> source.fetch("AAPL", FROM, TO));
        verify(http, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void anInvertedWindowIsEmptyWithoutACall() throws Exception {
        assertTrue(source.fetch("AAPL", TO, FROM).isEmpty());

        verify(http, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }
}
