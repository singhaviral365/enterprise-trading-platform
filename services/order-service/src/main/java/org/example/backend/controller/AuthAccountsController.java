package org.example.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.example.backend.dto.CreateAccountRequest;
import org.example.backend.dto.CreateAccountResult;
import org.example.backend.dto.LinkAccountStatusResponse;
import org.example.backend.security.AuthContext;
import org.example.backend.service.TradeService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/accounts")
@Validated
public class AuthAccountsController {

    private final TradeService tradeService;

    public AuthAccountsController(TradeService tradeService) {
        this.tradeService = tradeService;
    }

    @PostMapping("/create")
    public CreateAccountResult createAccount(
            @Valid @RequestBody CreateAccountRequest request,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return tradeService.createAccountForAuth(userId, request);
    }

    @GetMapping("/link")
    public LinkAccountStatusResponse linkAccount(HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return tradeService.getAccountLinkStatusForUser(userId);
    }
}

