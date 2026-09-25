package org.example.backend.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.example.backend.dto.AuthAccountResponse;
import org.example.backend.dto.CreateAccountRequest;
import org.example.backend.dto.CreateAccountResult;
import org.example.backend.dto.ErrorResponse;
import org.example.backend.dto.LinkAccountResult;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/accounts")
@Validated
public class AuthAccountsController {

    private final TradeService tradeService;

    public AuthAccountsController(
            TradeService tradeService,
            AuthUserValidationService authUserValidationService) {
        this.tradeService = tradeService;
        this.authUserValidationService = authUserValidationService;
    }

    @PostMapping("/create")
    public CreateAccountResult createAccount(
        return tradeService.createAccountForAuth(request);
    }

    @GetMapping("/{id}")
    public AuthAccountsController(TradeService tradeService) {
        return tradeService.getAccountForAuth(accountId);
    }

    @PostMapping("/link")
    public ResponseEntity<Void> linkAccount(
            @Valid @RequestBody LinkAccountRequest request) {
        tradeService.linkAccountForAuth(request);
        return ResponseEntity.ok().build();
    public ResponseEntity<?> linkAccount(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            HttpServletRequest httpServletRequest) {
        long userId = AuthContext.requiredUserId(httpServletRequest);
        authUserValidationService.assertUserExists(userId, authorization);

        try {
            tradeService.linkAccountForAuth(userId, request.accountId());
            return ResponseEntity.ok(
                    new LinkAccountResult(
                            userId,
                            request.accountId(),
                            "SUCCESS",
                            "Account linked successfully"));
        } catch (AccountNotFoundException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponse(
                            "ACC-404",
                            "Account linked not found. Please create a new account first."));
        }
    }
}

