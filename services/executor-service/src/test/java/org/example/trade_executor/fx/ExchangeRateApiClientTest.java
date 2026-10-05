package org.example.trade_executor.fx;

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
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ExchangeRateApiClientTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-04T05:30:00Z"), ZoneOffset.UTC);

    private static final String SUCCESS = """
            {
              "result": "success",
              "base_code": "USD",
              "conversion_rates": { "USD": 1, "INR": 96.35332268, "EUR": 0.88867465 }
            }
            """;

    private HttpClient httpClient;
    private ExchangeRateApiClient client;

    @BeforeEach
    void setUp() {
        httpClient = mock(HttpClient.class);
        client = new ExchangeRateApiClient(
                httpClient,
                new ObjectMapper(),
                "https://v6.exchangerate-api.com/v6/",
                "secret-key",
                Duration.ofSeconds(1),
                CLOCK);
    }

    @SuppressWarnings("unchecked")
    private void respondWith(int status, String body) throws IOException, InterruptedException {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    @Test
    void requestsTheLatestRatesForTheBaseCurrencyAndParsesThem() throws Exception {
        respondWith(200, SUCCESS);

        ExchangeRates rates = client.fetchLatest("USD");

        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertEquals("https://v6.exchangerate-api.com/v6/secret-key/latest/USD", request.getValue().uri().toString());
        assertEquals("USD", rates.baseCode());
        assertEquals(new BigDecimal("96.35332268"), rates.rates().get("INR"));
        assertEquals(CLOCK.instant(), rates.fetchedAt());
        assertTrue(rates.supports("EUR"));
        assertFalse(rates.supports("GBP"));
    }

    @Test
    void anErrorResultBecomesAnUnavailableExceptionNamingTheErrorType() throws Exception {
        respondWith(200, "{\"result\":\"error\",\"error-type\":\"quota-reached\"}");

        ExchangeRateUnavailableException ex =
                assertThrows(ExchangeRateUnavailableException.class, () -> client.fetchLatest("USD"));

        assertTrue(ex.getMessage().contains("quota-reached"));
        assertFalse(ex.getMessage().contains("secret-key"));
    }

    @Test
    void anUnreadableBodyBecomesAnUnavailableException() throws Exception {
        respondWith(502, "<html>Bad gateway</html>");

        assertThrows(ExchangeRateUnavailableException.class, () -> client.fetchLatest("USD"));
    }

    @Test
    void anIoErrorDoesNotLeakTheKeyedUrl() throws Exception {
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("connect failed to https://v6.exchangerate-api.com/v6/secret-key/latest/USD"));

        ExchangeRateUnavailableException ex =
                assertThrows(ExchangeRateUnavailableException.class, () -> client.fetchLatest("USD"));

        assertFalse(ex.getMessage().contains("secret-key"));
    }

    @Test
    void withoutAnApiKeyNoRequestIsSent() {
        ExchangeRateApiClient keyless = new ExchangeRateApiClient(
                httpClient, new ObjectMapper(), "https://v6.exchangerate-api.com/v6", " ", Duration.ofSeconds(1), CLOCK);

        assertThrows(ExchangeRateUnavailableException.class, () -> keyless.fetchLatest("USD"));
        verifyNoInteractions(httpClient);
    }
}
