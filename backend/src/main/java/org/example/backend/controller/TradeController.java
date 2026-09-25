package org.example.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.example.backend.dto.AccountResponse;
import org.example.backend.dto.BalanceResponse;
import org.example.backend.dto.OrderHistoryEntry;
import org.example.backend.dto.OrderResponse;
import org.example.backend.dto.PlaceOrderRequest;
import org.example.backend.dto.PositionResponse;
import org.example.backend.enums.OrderStatus;
import org.example.backend.security.AuthContext;
import org.example.backend.service.TradeService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1")
@Validated
public class TradeController {

    private final TradeService tradeService;

    public TradeController(TradeService tradeService) {
        this.tradeService = tradeService;
    }

    // =========================================================
    // STORY 5 - PLACE ORDER
    // =========================================================

    @PostMapping("/orders")
    public OrderResponse placeOrder(
            @Valid @RequestBody PlaceOrderRequest request,
            HttpServletRequest httpServletRequest) {

        long authenticatedUserId =
                AuthContext.requiredUserId(httpServletRequest);

        tradeService.assertUserCanAccessAccount(
                authenticatedUserId,
                request.accountId());

        return tradeService.placeOrder(
                request.accountId(),
                request.symbol(),
                request.side(),
                request.orderPricingType(),
                request.quantity(),
                request.price(),
                request.idempotencyKey());
    }

    // =========================================================
    // STORY 5 - CANCEL ORDER
    // =========================================================

    /*
     * Keep the ID type aligned with the current database/entity
     * until the UUID vs BIGINT mismatch is resolved.
     */
    @DeleteMapping("/orders/{id}")
    public OrderResponse cancelOrder(
            @PathVariable("id") long orderId,
            HttpServletRequest httpServletRequest) {

        long authenticatedUserId =
                AuthContext.requiredUserId(httpServletRequest);

        return tradeService.cancelOrderForUser(
                orderId,
                authenticatedUserId);
    }

    // =========================================================
    // STORY 6 - ACCOUNT
    // =========================================================

    @GetMapping("/accounts/{id}")
    public AccountResponse getAccount(
            @PathVariable("id")
            @Min(1)
            long accountId,
            HttpServletRequest request) {

        assertAccess(accountId, request, tradeService);

        return tradeService.getAccount(accountId);
    }

    // =========================================================
    // STORY 6 - BALANCE
    // =========================================================

    @GetMapping("/accounts/{id}/balance")
    public BalanceResponse getBalance(
            @PathVariable("id")
            @Min(1)
            long accountId,
            HttpServletRequest request) {

        assertAccess(accountId, request, tradeService);

        return tradeService.getBalance(accountId);
    }

    // =========================================================
    // STORY 6 - POSITIONS
    // =========================================================

    @GetMapping("/accounts/{id}/positions")
    public List<PositionResponse> getPositions(
            @PathVariable("id")
            @Min(1)
            long accountId,
            HttpServletRequest request) {

        assertAccess(accountId, request, tradeService);

        return tradeService.getPositions(accountId);
    }

    // =========================================================
    // STORY 6 - ORDER HISTORY
    // =========================================================

    @GetMapping("/accounts/{id}/orders")
    public List<OrderHistoryEntry> getOrders(
            @PathVariable("id")
            @Min(1)
            long accountId,

            @RequestParam(required = false)
            OrderStatus status,

            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            OffsetDateTime from,

            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            OffsetDateTime to,

            HttpServletRequest request) {

        assertAccess(accountId, request, tradeService);

        return tradeService.getOrders(
                accountId,
                status,
                from,
                to);
    }

    // =========================================================
    // AUTHORIZATION
    // =========================================================

    private static void assertAccess(
            long accountId,
            HttpServletRequest request,
            TradeService tradeService) {

        long authenticatedUserId =
                AuthContext.requiredUserId(request);

        tradeService.assertUserCanAccessAccount(
                authenticatedUserId,
                accountId);
    }
}