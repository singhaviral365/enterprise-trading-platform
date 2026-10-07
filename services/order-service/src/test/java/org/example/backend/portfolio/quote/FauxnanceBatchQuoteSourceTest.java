package org.example.backend.portfolio.quote;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What goes on the wire (one batched call, the key header) and how the answer is read. The HTTP client is replaced, so
 * the test needs no network and no open port.
 */
class FauxnanceBatchQuoteSourceTest {

    private static final String BODY = """
            {"data":[
              {"symbol":"AAPL","source":"live","stale":false,
               "quote":{"symbol":"AAPL","price":232.71,"previousClose":230.00,"currency":"USD","asOf":"2026-10-07T11:59:30Z"}},
              {"symbol":"INFY.NS","source":"cache","stale":true,
               "quote":{"symbol":"INFY.NS","price":"1013.85","previousClose":1020.50,"currency":"INR","asOf":"2026-10-07T10:00:00+00:00"}},
              {"symbol":"NOPE","error":{"code":"UNKNOWN_SYMBOL"}}
            ]}""";

    private static final String BASE = "https://fauxnance.example/v1";

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

    private FauxnanceBatchQuoteSource source(String baseUrl, String key) {
        return new FauxnanceBatchQuoteSource(client, new ObjectMapper(), baseUrl, key, Duration.ofSeconds(2), Clock.systemUTC());
    }

    @SuppressWarnings("unchecked")
    private HttpRequest sentRequest() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(captor.capture(), any(HttpResponse.BodyHandler.class));
        return captor.getValue();
    }

    @Test
    void oneBatchedCallCarriesEverySymbolAndTheKeyHeader() throws Exception {
        answer(200, BODY);

        Map<String, Quote> quotes = source(BASE, "secret-key").fetch(List.of("AAPL", "INFY.NS", "NOPE"));

        HttpRequest request = sentRequest();
        assertEquals("GET", request.method());
        assertEquals("https://fauxnance.example/v1/quotes?symbols=AAPL%2CINFY.NS%2CNOPE", request.uri().toString());
        assertEquals("secret-key", request.headers().firstValue("X-Api-Key").orElseThrow());
        assertEquals(2, quotes.size(), "an unknown symbol is simply absent");
    }

    @Test
    void aBaseUrlWithOrWithoutATrailingSlashReachesTheSameEndpoint() throws Exception {
        answer(200, BODY);

        source(BASE + "/", "k").fetch(List.of("AAPL"));

        assertEquals("https://fauxnance.example/v1/quotes?symbols=AAPL", sentRequest().uri().toString());
    }

    @Test
    void readsPriceCurrencyPreviousCloseObservationTimeAndTheStaleFlag() throws Exception {
        answer(200, BODY);

        Map<String, Quote> quotes = source(BASE, "k").fetch(List.of("AAPL", "INFY.NS"));

        Quote apple = quotes.get("AAPL");
        assertEquals(0, apple.price().compareTo(new BigDecimal("232.71")));
        assertEquals("USD", apple.currency());
        assertEquals(0, apple.previousClose().compareTo(new BigDecimal("230.00")));
        assertEquals(Instant.parse("2026-10-07T11:59:30Z"), apple.asOf());
        assertFalse(apple.stale());

        Quote infosys = quotes.get("INFY.NS");
        assertEquals(0, infosys.price().compareTo(new BigDecimal("1013.85")), "a price sent as text is read");
        assertEquals("INR", infosys.currency());
        assertTrue(infosys.stale(), "the vendor's own stale flag is kept");
        assertEquals(Instant.parse("2026-10-07T10:00:00Z"), infosys.asOf());
    }

    @Test
    void aQuotaResponseIsReportedAsQuotaExhausted() throws Exception {
        answer(429, "");

        QuoteSourceException ex = assertThrows(QuoteSourceException.class, () -> source(BASE, "k").fetch(List.of("AAPL")));

        assertTrue(ex.isQuotaExceeded());
    }

    @Test
    void aServerErrorFailsTheCallWithoutLeakingTheUrlOrTheKey() throws Exception {
        answer(503, "");

        QuoteSourceException ex = assertThrows(QuoteSourceException.class, () -> source(BASE, "secret-key").fetch(List.of("AAPL")));

        assertFalse(ex.isQuotaExceeded());
        assertFalse(ex.getMessage().contains("secret-key"));
        assertFalse(ex.getMessage().contains("fauxnance.example"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void anUnreachableServerFailsTheCallWithoutLeakingTheUrlOrTheKey() throws Exception {
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("connect to fauxnance.example refused, X-Api-Key secret-key"));

        QuoteSourceException ex = assertThrows(QuoteSourceException.class, () -> source(BASE, "secret-key").fetch(List.of("AAPL")));

        assertFalse(ex.getMessage().contains("fauxnance.example"));
        assertFalse(ex.getMessage().contains("secret-key"));
    }

    @Test
    void withoutABaseUrlItSaysSoAndMakesNoCall() throws Exception {
        FauxnanceBatchQuoteSource unconfigured = source("", "");

        assertThrows(QuoteSourceException.class, () -> unconfigured.fetch(List.of("AAPL")));
        assertNull(unconfigured.remainingQuota());
        verify(client, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void noContentIsAnEmptyAnswerNotAnError() throws Exception {
        answer(404, "");

        assertTrue(source(BASE, "k").fetch(List.of("AAPL")).isEmpty());
    }

    @Test
    void anEmptyRequestMakesNoCall() throws Exception {
        assertTrue(source(BASE, "k").fetch(List.of()).isEmpty());

        verify(client, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void theRemainingQuotaIsReadFromTheUsageEndpointAndAskedForRarely() throws Exception {
        answer(200, "{\"data\":{\"quota\":{\"remaining\":1873}}}");
        FauxnanceBatchQuoteSource source = source(BASE, "k");

        assertEquals(1873, source.remainingQuota());
        assertEquals(1873, source.remainingQuota());

        verify(client, times(1)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void aBareQuoteWithoutTheWrapperIsAcceptedToo() {
        Map<String, Quote> quotes = source(BASE, "k").parse("[{\"symbol\":\"msft\",\"price\":410.5,\"currency\":\"usd\"}]");

        assertEquals("USD", quotes.get("MSFT").currency());
        assertNull(quotes.get("MSFT").previousClose());
        assertNull(quotes.get("MSFT").asOf());
    }

    @Test
    void aBodyThatIsNotJsonIsAFailureNotAnEmptyAnswer() {
        assertThrows(QuoteSourceException.class, () -> source(BASE, "k").parse("<html>maintenance</html>"));
    }
}
