package org.example.backend.controller;

import org.example.backend.dto.CreateAccountResult;
import org.example.backend.dto.LinkAccountStatusResponse;
import org.example.backend.security.AuthContext;
import org.example.backend.service.TradeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthAccountsControllerTest {

    private TradeService tradeService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        tradeService = mock(TradeService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new AuthAccountsController(tradeService))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void createAccountReturnsExpectedPayload() throws Exception {
        when(tradeService.createAccountForAuth(eq(1000L), any()))
                .thenReturn(new CreateAccountResult(
                        1001L,
                        "AC0000001001",
                        "ACTIVE",
                        "Account created successfully",
                        "USD"));

        mockMvc.perform(post("/api/v1/accounts/create")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1000L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "client_name":"Alice Trader",
                                  "phone_no":"+1-555-1234",
                                  "email":"alice.trader@example.com",
                                  "dob":"1995-06-15",
                                  "balance":25000
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(1001))
                .andExpect(jsonPath("$.accountNumber").value("AC0000001001"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.currency").value("USD"));
    }

    @Test
    void linkAccountReturnsTrueWhenLinked() throws Exception {
                    when(tradeService.getAccountLinkStatusForUser(1001L))
                        .thenReturn(new LinkAccountStatusResponse(
                            true,
                            "Linked account found",
                            "ACC000001001"));

        mockMvc.perform(get("/api/v1/accounts/link")
                            .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1001L))
                .andExpect(status().isOk())
                        .andExpect(jsonPath("$.linked").value(true))
                        .andExpect(jsonPath("$.message").value("Linked account found"))
                        .andExpect(jsonPath("$.accountNumber").value("ACC000001001"));
    }

    @Test
    void linkAccountReturnsFalseWhenNotLinked() throws Exception {
                    when(tradeService.getAccountLinkStatusForUser(1001L))
                        .thenReturn(new LinkAccountStatusResponse(
                            false,
                            "No linked account yet",
                            null));

        mockMvc.perform(get("/api/v1/accounts/link")
                            .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1001L))
                .andExpect(status().isOk())
                        .andExpect(jsonPath("$.linked").value(false))
                        .andExpect(jsonPath("$.message").value("No linked account yet"))
                        .andExpect(jsonPath("$.accountNumber").doesNotExist());
    }

    @Test
                    void linkAccountWithoutJwtReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/link")
                            .contentType(MediaType.APPLICATION_JSON))
                        .andExpect(status().isUnauthorized());
    }
}
