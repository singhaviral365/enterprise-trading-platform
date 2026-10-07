package org.example.backend.portfolio.performance;

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

class FauxnanceCandleSourceTest {

    private static final String BASE = "https://fauxnance.example/v1";
    private static final String KEY = "secret-key-123";
    private static final LocalDate FROM = LocalDate.of(2026, 9, 1);
    private static final LocalDate TO = LocalDate.of(2026, 10, 6);

    private static final String BODY = """
            {"data":{"symbol":"AAPL","currency":"usd","candles":[
              {"date":"2026-10-05","open":1,"high":2,"low":1,"close":230.5,"adjclose":229.1,"volume":10,"synthetic":false},
              {"date":"2026-10-06T00:00:00Z","close":"232.71","adjclose":null,"synthetic":true},
              {"date":"2026-10-07","close":0},
              {"close":10},
              {"date":"not-a-date","close":10}
            ]}}""";

    private HttpClient client;

    @BeforeEach
    void setUp() {
        client = mock(HttpClient.class);
    }

    @SuppressWarnings("unchecked")
    private void answer(int status, String body) throws Exception {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    private FauxnanceCandleSource source(String baseUrl, String key) {
        return new FauxnanceCandleSource(client, new ObjectMapper(), baseUrl, key, Duration.ofSeconds(2));
    }

    @SuppressWarnings("unchecked")
    private HttpRequest sentRequest() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(captor.capture(), any(HttpResponse.BodyHandler.class));
        return captor.getValue();
    }

    @Test
    void oneCallAsksForTheWholeRangeAtDailyIntervalWithTheKeyHeader() throws Exception {
        answer(200, BODY);

        source(BASE, KEY).fetch("AAPL", FROM, TO);

        HttpRequest request = sentRequest();
        assertEquals("GET", request.method());
        assertEquals("https://fauxnance.example/v1/candles/AAPL?from=2026-09-01&to=2026-10-06&interval=1d", request.uri().toString());
        assertEquals(KEY, request.headers().firstValue("X-Api-Key").orElseThrow());
    }

    @Test
    void aSymbolWithADotOrAColonIsEncodedInThePath() throws Exception {
        answer(200, BODY);

        source(BASE + "/", KEY).fetch("FX:EURUSD", FROM, TO);

        assertEquals("https://fauxnance.example/v1/candles/FX%3AEURUSD?from=2026-09-01&to=2026-10-06&interval=1d",
                sentRequest().uri().toString());
    }

    @Test
    void readsRawCloseAdjustedCloseCurrencyAndTheSyntheticFlag() throws Exception {
        answer(200, BODY);

        List<DailyCandle> candles = source(BASE, KEY).fetch("AAPL", FROM, TO);

        assertEquals(2, candles.size(), "a row without a date, with a bad date or with no positive close is skipped");
        DailyCandle real = candles.get(0);
        assertEquals(LocalDate.of(2026, 10, 5), real.date());
        assertEquals(0, real.close().compareTo(new BigDecimal("230.5")));
        assertEquals(0, real.adjclose().compareTo(new BigDecimal("229.1")));
        assertEquals("USD", real.currency());
        assertFalse(real.synthetic());

        DailyCandle synthetic = candles.get(1);
        assertEquals(LocalDate.of(2026, 10, 6), synthetic.date(), "a timestamp is cut to its date");
        assertEquals(0, synthetic.close().compareTo(new BigDecimal("232.71")), "a close sent as text is read");
        assertEquals(0, synthetic.adjclose().compareTo(synthetic.close()), "a missing adjclose falls back to the close");
        assertTrue(synthetic.synthetic());
    }

    @Test
    void aRangeLongerThanTenYearsIsCutToTheLastTen() throws Exception {
        answer(200, BODY);

        source(BASE, KEY).fetch("AAPL", LocalDate.of(2000, 1, 1), TO);

        String uri = sentRequest().uri().toString();
        assertTrue(uri.contains("from=" + TO.minusDays(FauxnanceCandleSource.MAX_SPAN_DAYS)), uri);
    }

    @Test
    void anEmptyRangeAsksForNothing() throws Exception {
        assertTrue(source(BASE, KEY).fetch("AAPL", TO, FROM).isEmpty());

        verify(client, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void anUnknownSymbolOrNoContentIsSimplyNoCandles() throws Exception {
        answer(404, "");
        assertTrue(source(BASE, KEY).fetch("NOPE", FROM, TO).isEmpty());

        answer(204, null);
        assertTrue(source(BASE, KEY).fetch("NOPE", FROM, TO).isEmpty());
    }

    @Test
    void aBodyWithoutCandlesIsNoCandlesAndOneThatIsNotJsonIsAFailure() throws Exception {
        answer(200, "{\"data\":{\"symbol\":\"AAPL\"}}");
        assertTrue(source(BASE, KEY).fetch("AAPL", FROM, TO).isEmpty());

        answer(200, "<html>oops</html>");
        assertThrows(CandleSourceException.class, () -> source(BASE, KEY).fetch("AAPL", FROM, TO));
    }

    @Test
    void eachStatusSaysWhetherToStopForTodayOrTryAgainNextRun() throws Exception {
        answer(429, "");
        CandleSourceException quota = assertThrows(CandleSourceException.class, () -> source(BASE, KEY).fetch("AAPL", FROM, TO));
        assertEquals(CandleSourceException.Kind.QUOTA, quota.kind());
        assertTrue(quota.isQuotaExceeded());

        answer(202, "");
        CandleSourceException notReady = assertThrows(CandleSourceException.class, () -> source(BASE, KEY).fetch("AAPL", FROM, TO));
        assertEquals(CandleSourceException.Kind.NOT_READY, notReady.kind());
        assertFalse(notReady.isQuotaExceeded());

        answer(500, "boom");
        CandleSourceException failed = assertThrows(CandleSourceException.class, () -> source(BASE, KEY).fetch("AAPL", FROM, TO));
        assertEquals(CandleSourceException.Kind.FAILED, failed.kind());
    }

    @Test
    void aNetworkFailureIsAFailureAndNeverTheUrlOrTheKey() throws Exception {
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("connect to https://fauxnance.example/v1 with " + KEY + " failed"));

        CandleSourceException thrown = assertThrows(CandleSourceException.class, () -> source(BASE, KEY).fetch("AAPL", FROM, TO));

        assertEquals(CandleSourceException.Kind.FAILED, thrown.kind());
        assertFalse(thrown.getMessage().contains(KEY));
        assertFalse(thrown.getMessage().contains("fauxnance.example"));
    }

    @Test
    void noMessageEverCarriesTheKeyOrTheUrl() throws Exception {
        for (int status : new int[] {202, 429, 500, 503}) {
            answer(status, "");
            CandleSourceException thrown = assertThrows(CandleSourceException.class, () -> source(BASE, KEY).fetch("AAPL", FROM, TO));
            assertFalse(thrown.getMessage().contains(KEY));
            assertFalse(thrown.getMessage().contains("fauxnance.example"));
        }
    }

    @Test
    void withoutABaseUrlItSaysSoAndMakesNoCall() throws Exception {
        CandleSourceException thrown = assertThrows(CandleSourceException.class, () -> source("", KEY).fetch("AAPL", FROM, TO));

        assertTrue(thrown.getMessage().contains("not configured"));
        verify(client, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void withoutAKeyNoKeyHeaderIsSent() throws Exception {
        answer(200, BODY);

        source(BASE, "").fetch("AAPL", FROM, TO);

        assertTrue(sentRequest().headers().firstValue("X-Api-Key").isEmpty());
    }
}
