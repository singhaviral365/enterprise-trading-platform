package org.example.backend.strategy.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.example.backend.security.AuthContext;
import org.example.backend.strategy.dto.CreateStrategyRequest;
import org.example.backend.strategy.dto.StrategyResponse;
import org.example.backend.strategy.dto.StrategyRunResponse;
import org.example.backend.strategy.dto.UpdateStrategyRequest;
import org.example.backend.strategy.service.StrategyService;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The customer's strategies: create, list, switch off and on, cancel, and read the trail of what each one did. Every
 * route answers for the token's user only. Nothing here places an order.
 */
@RestController
@RequestMapping("/api/v1")
@Validated
public class StrategyController {

    private final StrategyService strategies;

    public StrategyController(StrategyService strategies) {
        this.strategies = strategies;
    }

    @PostMapping("/strategies")
    @ResponseStatus(HttpStatus.CREATED)
    public StrategyResponse create(
            @Valid @RequestBody CreateStrategyRequest request,
            HttpServletRequest httpServletRequest) {

        return strategies.create(AuthContext.requiredUserId(httpServletRequest), request);
    }

    @GetMapping("/accounts/{accountId}/strategies")
    public List<StrategyResponse> list(
            @PathVariable("accountId") @Min(1) long accountId,
            HttpServletRequest httpServletRequest) {

        return strategies.list(AuthContext.requiredUserId(httpServletRequest), accountId);
    }

    @GetMapping("/strategies/{id}")
    public StrategyResponse get(
            @PathVariable("id") @Min(1) long strategyId,
            HttpServletRequest httpServletRequest) {

        return strategies.get(AuthContext.requiredUserId(httpServletRequest), strategyId);
    }

    @PatchMapping("/strategies/{id}")
    public StrategyResponse update(
            @PathVariable("id") @Min(1) long strategyId,
            @Valid @RequestBody UpdateStrategyRequest request,
            HttpServletRequest httpServletRequest) {

        return strategies.setEnabled(AuthContext.requiredUserId(httpServletRequest), strategyId, request.enabled());
    }

    @DeleteMapping("/strategies/{id}")
    public StrategyResponse cancel(
            @PathVariable("id") @Min(1) long strategyId,
            HttpServletRequest httpServletRequest) {

        return strategies.cancel(AuthContext.requiredUserId(httpServletRequest), strategyId);
    }

    @GetMapping("/strategies/{id}/runs")
    public List<StrategyRunResponse> runs(
            @PathVariable("id") @Min(1) long strategyId,
            HttpServletRequest httpServletRequest) {

        return strategies.runs(AuthContext.requiredUserId(httpServletRequest), strategyId);
    }
}
