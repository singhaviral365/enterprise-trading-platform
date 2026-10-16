package org.example.backend.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MarketProxyControllerTest {

    private HttpClient httpClient;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        httpClient = mock(HttpClient.class);
        MarketProxyController controller =
                new MarketProxyController(httpClient, "http://executor-service:8082", Duration.ofSeconds(2));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @SuppressWarnings("unchecked")
    private void executorAnswers(int status, String body) throws Exception {
        HttpResponse<byte[]> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body.getBytes(StandardCharsets.UTF_8));
        when(response.headers()).thenReturn(
                HttpHeaders.of(Map.of("Content-Type", List.of("application/json")), (k, v) -> true));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    @SuppressWarnings("unchecked")
    private String requestedUri() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any(HttpResponse.BodyHandler.class));
        return captor.getValue().uri().toString();
    }

    @Test
    void quotesAreRelayedUntouched() throws Exception {
        executorAnswers(200, "{\"quotes\":[],\"stale\":false}");

        mockMvc.perform(get("/api/v1/market/quotes"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(content().json("{\"quotes\":[],\"stale\":false}"));

        assertEquals("http://executor-service:8082/api/v1/market/quotes", requestedUri());
    }

    @Test
    void candlesAreRelayedForTheSymbol() throws Exception {
        executorAnswers(200, "{\"symbol\":\"AAPL\",\"candles\":[]}");

        mockMvc.perform(get("/api/v1/market/candles/AAPL"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"symbol\":\"AAPL\",\"candles\":[]}"));

        assertEquals("http://executor-service:8082/api/v1/market/candles/AAPL", requestedUri());
    }

    @Test
    void symbolIsEncodedAndExecutorStatusIsPassedOn() throws Exception {
        executorAnswers(404, "{\"error\":\"unknown\"}");

        mockMvc.perform(get("/api/v1/market/candles/RELIANCE.NS"))
                .andExpect(status().isNotFound());

        assertEquals("http://executor-service:8082/api/v1/market/candles/RELIANCE.NS", requestedUri());
    }

    @Test
    void unreachableExecutorGives503() throws Exception {
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("connection refused"));

        mockMvc.perform(get("/api/v1/market/quotes"))
                .andExpect(status().isServiceUnavailable());
    }
}
