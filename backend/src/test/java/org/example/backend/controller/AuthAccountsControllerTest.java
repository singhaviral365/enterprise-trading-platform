                                  "user_id":1001,
package org.example.backend.controller;

import org.example.backend.dto.AuthAccountResponse;
import org.example.backend.dto.CreateAccountRequest;
import org.example.backend.dto.CreateAccountResult;
import org.example.backend.dto.LinkAccountRequest;
import org.example.backend.enums.AccountStatus;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.security.AuthContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthAccountsControllerTest {

    private TradeService tradeService;
    private AuthUserValidationService authUserValidationService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        tradeService = mock(TradeService.class);
        authUserValidationService = mock(AuthUserValidationService.class);
        mockMvc = MockMvcBuilders
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void createAccountReturnsExpectedPayload() throws Exception {
                .thenReturn(new CreateAccountResult(
                        1001L,
                        "AC0000001001",
                .standaloneSetup(new AuthAccountsController(tradeService))
                        "Account created successfully"));

        mockMvc.perform(post("/api/accounts/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "client_name":"Alice Trader",
                                  "phone_no":"+1-555-1234",
                                  "email":"alice.trader@example.com",
                                  "dob":"1995-06-15",
                                  "user_id":1000
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(1001))
                .andExpect(jsonPath("$.accountNumber").value("AC0000001001"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void getAccountReturnsExpectedPayload() throws Exception {
        when(tradeService.getAccountForAuth(42L))
                .thenReturn(new AuthAccountResponse(
                        42L,
                        "AC0000000042",
                        AccountStatus.ACTIVE,
                        new BigDecimal("1000.0000"),
                        new BigDecimal("1000.0000")));

        mockMvc.perform(get("/api/accounts/42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(42))
                .andExpect(jsonPath("$.accountNumber").value("AC0000000042"))
                .andExpect(jsonPath("$.accountStatus").value("ACTIVE"))
                .andExpect(jsonPath("$.balance").value(1000.0))
                .andExpect(jsonPath("$.purchasingPower").value(1000.0));
    }

    @Test
    void missingAccountReturns404() throws Exception {
        when(tradeService.getAccountForAuth(404L))
                .thenThrow(new AccountNotFoundException(404L));

        mockMvc.perform(get("/api/accounts/404"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void linkAccountReturns200() throws Exception {
        doNothing().when(authUserValidationService).assertUserExists(anyLong(), any(String.class));
        doNothing().when(tradeService).linkAccountForAuth(1001L, 42L);

        mockMvc.perform(post("/api/accounts/link")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1001L)
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
        doNothing().when(tradeService).linkAccountForAuth(any(LinkAccountRequest.class));
                                """))
                .andExpect(status().isOk());
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.accountId").value(42));
    }

    @Test
    void linkAccountMissingAccountReturnsCreateSuggestion() throws Exception {
        doNothing().when(authUserValidationService).assertUserExists(anyLong(), any(String.class));
        doThrow(new AccountNotFoundException(42L))
                .when(tradeService)
                .linkAccountForAuth(1001L, 42L);

        mockMvc.perform(post("/api/accounts/link")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1001L)
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "account_id":42
                                }
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"))
                .andExpect(jsonPath("$.message").value("Account linked not found. Please create a new account first."));
    }

    @Test
    void linkAccountConflictReturnsAcc409() throws Exception {
        doNothing().when(authUserValidationService).assertUserExists(anyLong(), any(String.class));
        doThrow(new AccountLinkConflictException("User is already linked to account 42"))
                .when(tradeService)
                .linkAccountForAuth(1001L, 43L);

        mockMvc.perform(post("/api/accounts/link")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1001L)
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "account_id":43
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("ACC-409"));
    }
}

