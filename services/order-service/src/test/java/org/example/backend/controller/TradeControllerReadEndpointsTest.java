package org.example.backend.controller;

import org.example.backend.dto.AccountResponse;
import org.example.backend.dto.BalanceResponse;
import org.example.backend.dto.OrderHistoryEntry;
import org.example.backend.dto.PositionResponse;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.security.AuthContext;
import org.example.backend.service.TradeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TradeControllerReadEndpointsTest {

    private TradeService tradeService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        tradeService = mock(TradeService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new TradeController(tradeService))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void accountReturnedSuccessfully() throws Exception {
        when(tradeService.getAccount(1L))
                .thenReturn(new AccountResponse(
                        1L,
                        "ACC-000001",
                        "Priya Menon",
                        new BigDecimal("24500.75"),
                        AccountStatus.ACTIVE,
                        7,
                        OffsetDateTime.parse("2026-09-10T09:14:22Z")));

        mockMvc.perform(get("/api/v1/accounts/1")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.accountId").value("ACC-000001"))
                .andExpect(jsonPath("$.holderName").value("Priya Menon"))
                .andExpect(jsonPath("$.cashBalance").value(24500.75))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(7));
    }

    @Test
    void balanceReturnedSuccessfully() throws Exception {
        when(tradeService.getBalance(1L))
                .thenReturn(new BalanceResponse(
                        1L,
                        new BigDecimal("24500.75"),
                        "USD",
                        OffsetDateTime.parse("2026-09-10T09:14:22Z")));

        mockMvc.perform(get("/api/v1/accounts/1/balance")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(1))
                .andExpect(jsonPath("$.cashBalance").value(24500.75))
                .andExpect(jsonPath("$.currency").value("USD"));
    }

    @Test
    void positionsReturnedSuccessfully() throws Exception {
        when(tradeService.getPositions(1L))
                .thenReturn(List.of(
                        new PositionResponse(1L, "ACME", "Acme Corporation", "/assets/icons/ACME.svg", 100, new BigDecimal("25.50")),
                        new PositionResponse(1L, "INFY.NS", "Infosys Ltd", null, 40, new BigDecimal("1580.25"))));

        mockMvc.perform(get("/api/v1/accounts/1/positions")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountId").value(1))
                .andExpect(jsonPath("$[0].symbol").value("ACME"))
                .andExpect(jsonPath("$[0].instrumentName").value("Acme Corporation"))
                .andExpect(jsonPath("$[0].iconUrl").value("/assets/icons/ACME.svg"))
                .andExpect(jsonPath("$[0].quantity").value(100))
                .andExpect(jsonPath("$[0].averageCost").value(25.50))
                .andExpect(jsonPath("$[1].symbol").value("INFY.NS"));
    }

    @Test
    void orderHistoryReturnedSuccessfully() throws Exception {
        when(tradeService.getOrders(1L, null, null, null))
                .thenReturn(List.of(
                        new OrderHistoryEntry(
                                "1",
                                1L,
                                "ACME",
                                "Acme Corporation",
                                "/assets/icons/ACME.svg",
                                OrderSide.BUY,
                                OrderPricingType.LIMIT,
                                100,
                                new BigDecimal("25.50"),
                                new BigDecimal("25.50"),
                                OrderStatus.FILLED,
                                "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e",
                                OffsetDateTime.parse("2026-09-10T09:14:22Z"))));

        mockMvc.perform(get("/api/v1/accounts/1/orders")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 1L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId").value("1"))
                .andExpect(jsonPath("$[0].accountId").value(1))
                .andExpect(jsonPath("$[0].symbol").value("ACME"))
                .andExpect(jsonPath("$[0].instrumentName").value("Acme Corporation"))
                .andExpect(jsonPath("$[0].side").value("BUY"))
                .andExpect(jsonPath("$[0].orderPricingType").value("LIMIT"))
                .andExpect(jsonPath("$[0].status").value("FILLED"))
                .andExpect(jsonPath("$[0].idempotencyKey").value("6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e"));
    }

    @Test
    void unknownAccountReturnsAcc404() throws Exception {
        when(tradeService.getAccount(999L))
                .thenThrow(new AccountNotFoundException(999L));

        mockMvc.perform(get("/api/v1/accounts/999")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"))
                .andExpect(jsonPath("$.message").value("Account not found"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/v1/accounts/1",
            "/api/v1/accounts/1/balance",
            "/api/v1/accounts/1/positions",
            "/api/v1/accounts/1/orders"
    })
    void tokenForDifferentAccountReturnsAcc403(String path) throws Exception {
        doThrow(new org.example.backend.exceptions.AccountNotActiveException(1L, AccountStatus.ACTIVE))
                .when(tradeService)
                .assertUserCanAccessAccount(2L, 1L);

        mockMvc.perform(get(path)
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 2L))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"))
                .andExpect(jsonPath("$.message").value("Account not active"));
    }
}

