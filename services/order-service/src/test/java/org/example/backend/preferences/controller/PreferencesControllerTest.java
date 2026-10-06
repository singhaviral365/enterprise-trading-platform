package org.example.backend.preferences.controller;

import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.preferences.dto.PreferencesResponse;
import org.example.backend.preferences.dto.UpdatePreferencesRequest;
import org.example.backend.preferences.exceptions.PreferencesAccessDeniedException;
import org.example.backend.preferences.exceptions.UnsupportedCurrencyException;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.service.PreferencesService;
import org.example.backend.security.AuthContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PreferencesControllerTest {

    private static final String URL = "/api/v1/accounts/1001/preferences";
    private static final String VALID_BODY = """
            {
              "preferredCurrency": "EUR",
              "channels": ["EMAIL", "IN_APP"],
              "categories": ["ORDER_STATUS", "WATCHLIST_ALERTS"],
              "dateFormat": "DD_MM_YYYY",
              "timeFormat": "H24",
              "numberFormat": "IN",
              "aiAssistantEnabled": true,
              "theme": "DARK",
              "landingPage": "MARKET",
              "defaultOrderType": "LIMIT"
            }
            """;

    private PreferencesService service;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(PreferencesService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new PreferencesController(service))
                .setControllerAdvice(new PreferencesExceptionHandler(), new ApiExceptionHandler())
                .build();
    }

    private static PreferencesResponse sample() {
        return PreferencesResponse.of(1001L, CustomerPreferences.defaults("USD"), OffsetDateTime.parse("2026-10-06T10:00:00Z"));
    }

    @Test
    void getReturnsThePreferencesOfTheTokensUser() throws Exception {
        when(service.get(7L, 1001L)).thenReturn(sample());

        mockMvc.perform(get(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(1001))
                .andExpect(jsonPath("$.preferredCurrency").value("USD"))
                .andExpect(jsonPath("$.channels[0]").value("IN_APP"))
                .andExpect(jsonPath("$.dateFormat").value("MON_DD_YYYY"))
                .andExpect(jsonPath("$.timeFormat").value("H12"))
                .andExpect(jsonPath("$.numberFormat").value("US"))
                .andExpect(jsonPath("$.aiAssistantEnabled").value(false));
    }

    @Test
    void putReplacesThePreferencesAndAnswersWithTheStoredDocument() throws Exception {
        when(service.update(eq(7L), eq(1001L), any(UpdatePreferencesRequest.class))).thenReturn(sample());

        mockMvc.perform(put(URL)
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content(VALID_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updatedAt").exists());
    }

    @Test
    void aRequestWithoutAVerifiedUserIsUnauthorised() throws Exception {
        mockMvc.perform(get(URL))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
    }

    @Test
    void someoneElsesAccountIs403WithTheCatalogueCode() throws Exception {
        when(service.get(anyLong(), anyLong())).thenThrow(new PreferencesAccessDeniedException(1001L));

        mockMvc.perform(get(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"));
    }

    @Test
    void anUnknownAccountIs404() throws Exception {
        when(service.get(anyLong(), anyLong())).thenThrow(new AccountNotFoundException(1001L));

        mockMvc.perform(get(URL).requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void anUnsupportedCurrencyIs422() throws Exception {
        when(service.update(anyLong(), anyLong(), any())).thenThrow(new UnsupportedCurrencyException("XXX"));

        mockMvc.perform(put(URL)
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content(VALID_BODY.replace("EUR", "XXX")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    @Test
    void aBodyWithAMissingFieldOrAnUnknownOptionIsRejectedBeforeTheService() throws Exception {
        String missingTheme = VALID_BODY.replace("\"theme\": \"DARK\",", "");
        String unknownDateFormat = VALID_BODY.replace("DD_MM_YYYY", "WHENEVER");
        String lowercaseCurrency = VALID_BODY.replace("EUR", "eur");
        String nullChannel = VALID_BODY.replace("[\"EMAIL\", \"IN_APP\"]", "[\"EMAIL\", null]");

        for (String body : new String[] {missingTheme, unknownDateFormat, lowercaseCurrency, nullChannel, "{}"}) {
            mockMvc.perform(put(URL)
                            .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                            .contentType("application/json")
                            .content(body))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        }
        verify(service, never()).update(anyLong(), anyLong(), any());
    }
}
