package org.example.backend.watchlist.controller;

import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.security.AuthContext;
import org.example.backend.watchlist.dto.PriceAlertResponse;
import org.example.backend.watchlist.dto.WatchlistItemResponse;
import org.example.backend.watchlist.dto.WatchlistResponse;
import org.example.backend.watchlist.exceptions.PriceAlertAlreadyReachedException;
import org.example.backend.watchlist.exceptions.PriceAlertLimitExceededException;
import org.example.backend.watchlist.exceptions.PriceAlertNotFoundException;
import org.example.backend.watchlist.exceptions.WatchlistAccessDeniedException;
import org.example.backend.watchlist.model.AlertDelivery;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.AlertStatus;
import org.example.backend.watchlist.price.PriceStatus;
import org.example.backend.watchlist.service.PriceAlertService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PriceAlertControllerTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-06T09:00:00Z");
    private static final String URL = "/api/v1/accounts/5/watchlists/9/items/AAPL/alert";

    private PriceAlertService alerts;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        alerts = mock(PriceAlertService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new PriceAlertController(alerts))
                .setControllerAdvice(new WatchlistExceptionHandler(), new ApiExceptionHandler())
                .build();
    }

    private static WatchlistResponse withAlert() {
        PriceAlertResponse alert = new PriceAlertResponse(AlertDirection.ABOVE, new BigDecimal("200.5"), AlertStatus.TRIGGERED,
                T0, T0, new BigDecimal("201"), AlertDelivery.HANDED_OVER);
        return new WatchlistResponse(9L, 5L, "Tech", T0, T0, List.of(
                new WatchlistItemResponse("AAPL", T0, new BigDecimal("201"), T0, PriceStatus.LIVE, alert)));
    }

    @Test
    void settingAnAlertReturnsTheWatchlistWithTheAlertAndItsState() throws Exception {
        when(alerts.setAlert(7L, 5L, 9L, "AAPL", AlertDirection.ABOVE, new BigDecimal("200.5"))).thenReturn(withAlert());

        mockMvc.perform(put(URL)
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"direction\":\"ABOVE\",\"targetPrice\":200.5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].alert.direction").value("ABOVE"))
                .andExpect(jsonPath("$.items[0].alert.targetPrice").value(200.5))
                .andExpect(jsonPath("$.items[0].alert.status").value("TRIGGERED"))
                .andExpect(jsonPath("$.items[0].alert.delivery").value("HANDED_OVER"));
    }

    @Test
    void anEntryWithoutAnAlertSerialisesNullSoTheClientCanTellTheDifference() throws Exception {
        when(alerts.clearAlert(7L, 5L, 9L, "AAPL")).thenReturn(new WatchlistResponse(9L, 5L, "Tech", T0, T0, List.of(
                new WatchlistItemResponse("AAPL", T0, null, null, PriceStatus.UNAVAILABLE))));

        mockMvc.perform(delete(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].alert").doesNotExist());
    }

    @Test
    void theRequestIsValidatedBeforeTheServiceIsCalled() throws Exception {
        for (String body : List.of(
                "{}",
                "{\"direction\":\"ABOVE\"}",
                "{\"targetPrice\":10}",
                "{\"direction\":\"SIDEWAYS\",\"targetPrice\":10}",
                "{\"direction\":\"ABOVE\",\"targetPrice\":0}",
                "{\"direction\":\"ABOVE\",\"targetPrice\":-1}",
                "{\"direction\":\"ABOVE\",\"targetPrice\":1.23456}",
                "{\"direction\":\"ABOVE\",\"targetPrice\":2000000000}")) {
            mockMvc.perform(put(URL)
                            .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                            .contentType("application/json")
                            .content(body))
                    .andExpect(status().is4xxClientError());
        }
        verifyNoInteractions(alerts);
    }

    @Test
    void theCatalogueCodesMapToTheirStatuses() throws Exception {
        when(alerts.setAlert(anyLong(), anyLong(), anyLong(), any(), any(), any()))
                .thenThrow(new PriceAlertLimitExceededException(5, 20))
                .thenThrow(new PriceAlertAlreadyReachedException("AAPL"))
                .thenThrow(new WatchlistAccessDeniedException(5));
        when(alerts.clearAlert(anyLong(), anyLong(), anyLong(), any())).thenThrow(new PriceAlertNotFoundException(9, "AAPL"));
        String body = "{\"direction\":\"ABOVE\",\"targetPrice\":200}";

        mockMvc.perform(put(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L).contentType("application/json").content(body))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.errorCode").value("ALR-422"));
        mockMvc.perform(put(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L).contentType("application/json").content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.errorCode").value("ALR-409"));
        mockMvc.perform(put(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L).contentType("application/json").content(body))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("ACC-403"));
        mockMvc.perform(delete(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("ALR-404"));
    }

    @Test
    void theUserComesFromTheVerifiedTokenNeverFromTheRequest() throws Exception {
        when(alerts.clearAlert(7L, 5L, 9L, "AAPL")).thenReturn(withAlert());

        mockMvc.perform(delete(URL)
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .header("X-User-Id", "99")
                        .param("userId", "99"))
                .andExpect(status().isOk());

        verify(alerts).clearAlert(7L, 5L, 9L, "AAPL");
    }
}
