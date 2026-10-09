package org.example.backend.characterization.sprint6;

import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.controller.TradeController;
import org.example.backend.dto.OrderResponse;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.DuplicateOrderException;
import org.example.backend.exceptions.InsufficientFundsException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.security.AuthContext;
import org.example.backend.service.TradeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OrderPlacementEndpointCharacterizationTest {

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
    void affordableOrderReturnedFieldByField() throws Exception {
        when(tradeService.placeOrder(
                anyLong(),
                anyString(),
                any(OrderSide.class),
                any(OrderPricingType.class),
                anyLong(),
                any(BigDecimal.class),
                anyString()))
                .thenReturn(new OrderResponse(
                        "9001",
                        OrderStatus.NEW,
                        "Order placed successfully",
                        "ACME",
                        OrderSide.BUY,
                        OrderPricingType.LIMIT,
                        100,
                        new BigDecimal("50.0000")));

        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJson(1, "ACME", "BUY", "LIMIT", 100, "50.00", "idem-commit")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value("9001"))
                .andExpect(jsonPath("$.status").value("NEW"))
                .andExpect(jsonPath("$.message").value("Order placed successfully"))
                .andExpect(jsonPath("$.symbol").value("ACME"))
                .andExpect(jsonPath("$.side").value("BUY"))
                .andExpect(jsonPath("$.orderPricingType").value("LIMIT"))
                .andExpect(jsonPath("$.quantity").value(100))
                .andExpect(jsonPath("$.price").value(50.0000));
    }

    @Test
    void orderWithoutPriceIsAcceptedAndReturnedAsNew() throws Exception {
        when(tradeService.placeOrder(
                anyLong(),
                anyString(),
                any(OrderSide.class),
                any(OrderPricingType.class),
                anyLong(),
                any(),
                anyString()))
                .thenReturn(new OrderResponse(
                        "9002",
                        OrderStatus.NEW,
                        "Order placed successfully",
                        "ACME",
                        OrderSide.BUY,
                        OrderPricingType.MARKET,
                        100,
                        null));

        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJsonWithoutPrice(1, "ACME", "BUY", "MARKET", 100, "idem-market")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value("9002"))
                .andExpect(jsonPath("$.status").value("NEW"))
                .andExpect(jsonPath("$.orderPricingType").value("MARKET"))
                .andExpect(jsonPath("$.quantity").value(100));
    }

    @Test
    void reusedIdempotencyKeyReturnsOrd409() throws Exception {
        when(tradeService.placeOrder(
                anyLong(),
                anyString(),
                any(OrderSide.class),
                any(OrderPricingType.class),
                anyLong(),
                any(BigDecimal.class),
                anyString()))
                .thenThrow(new DuplicateOrderException("idem-duplicate"));

        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJson(1, "ACME", "BUY", "LIMIT", 100, "50.00", "idem-duplicate")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("ORD-409"))
                .andExpect(jsonPath("$.message").value("Duplicate order"));
    }

    @Test
    void unaffordableBuyReturnsOrd400() throws Exception {
        when(tradeService.placeOrder(
                anyLong(),
                anyString(),
                any(OrderSide.class),
                any(OrderPricingType.class),
                anyLong(),
                any(BigDecimal.class),
                anyString()))
                .thenThrow(new InsufficientFundsException(
                        1L,
                        new BigDecimal("5000.00"),
                        new BigDecimal("4999.99")));

        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJson(1, "ACME", "BUY", "LIMIT", 100, "50.00", "idem-insufficient")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("ORD-400"))
                .andExpect(jsonPath("$.message").value("Insufficient funds"));
    }

    @Test
    void unknownSymbolReturnsIns404() throws Exception {
        when(tradeService.placeOrder(
                anyLong(),
                anyString(),
                any(OrderSide.class),
                any(OrderPricingType.class),
                anyLong(),
                any(BigDecimal.class),
                anyString()))
                .thenThrow(new InstrumentNotFoundException("UNKNOWN"));

        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJson(1, "UNKNOWN", "BUY", "LIMIT", 100, "50.00", "idem-unknown")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("INS-404"))
                .andExpect(jsonPath("$.message").value("Instrument not found"));
    }

    @Test
    void inactiveAccountReturnsAcc403() throws Exception {
        when(tradeService.placeOrder(
                anyLong(),
                anyString(),
                any(OrderSide.class),
                any(OrderPricingType.class),
                anyLong(),
                any(BigDecimal.class),
                anyString()))
                .thenThrow(new AccountNotActiveException(1L, AccountStatus.SUSPENDED));

        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJson(1, "ACME", "BUY", "LIMIT", 100, "50.00", "idem-inactive")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"))
                .andExpect(jsonPath("$.message").value("Account not active"));
    }

    @Test
    void limitOrderWithoutPriceReturnsValidationError() throws Exception {
        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJsonWithoutPrice(1, "ACME", "BUY", "LIMIT", 100, "idem-limit-no-price")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Invalid input"));
    }

    @Test
    void marketOrderWithPriceReturnsValidationError() throws Exception {
        mockMvc.perform(post("/api/v1/orders")
                        .requestAttr(AuthContext.ACCOUNT_ID_ATTRIBUTE, 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placeOrderJson(1, "ACME", "BUY", "MARKET", 100, "50.00", "idem-market-with-price")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Invalid input"));
    }

    private static String placeOrderJson(
            long accountId,
            String symbol,
            String side,
            String orderPricingType,
            int quantity,
            String price,
            String idempotencyKey) {

        return """
                {
                  "accountId": %d,
                  "symbol": "%s",
                  "side": "%s",
                  "orderPricingType": "%s",
                  "quantity": %d,
                  "price": %s,
                  "idempotencyKey": "%s"
                }
                """.formatted(
                accountId,
                symbol,
                side,
                orderPricingType,
                quantity,
                price,
                idempotencyKey);
    }

    private static String placeOrderJsonWithoutPrice(
            long accountId,
            String symbol,
            String side,
            String orderPricingType,
            int quantity,
            String idempotencyKey) {

        return """
                {
                  "accountId": %d,
                  "symbol": "%s",
                  "side": "%s",
                  "orderPricingType": "%s",
                  "quantity": %d,
                  "idempotencyKey": "%s"
                }
                """.formatted(
                accountId,
                symbol,
                side,
                orderPricingType,
                quantity,
                idempotencyKey);
    }
}


