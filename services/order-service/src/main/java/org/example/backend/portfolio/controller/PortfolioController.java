package org.example.backend.portfolio.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.backend.portfolio.dto.PnlResponse;
import org.example.backend.portfolio.dto.PortfolioSummaryResponse;
import org.example.backend.portfolio.dto.PricedPositionResponse;
import org.example.backend.portfolio.dto.RealisedPnlResponse;
import org.example.backend.portfolio.service.PortfolioService;
import org.example.backend.security.AuthContext;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * The three routes of {@code contracts/portfolio-api.yaml}, served by the Trade REST API beside the order and account
 * routes. Each one passes the token's <b>user</b> and the path's account to the service, whose first act is the ownership
 * check ({@code PortfolioAccess}); nothing is read before it.
 */
@RestController
@RequestMapping("/api/v1/portfolio/{accountId}")
public class PortfolioController {

    private final PortfolioService portfolio;

    public PortfolioController(PortfolioService portfolio) {
        this.portfolio = portfolio;
    }

    @GetMapping
    public PortfolioSummaryResponse summary(
            @PathVariable("accountId") long accountId,
            HttpServletRequest request) {
        return portfolio.summary(AuthContext.requiredUserId(request), accountId);
    }

    @GetMapping("/positions")
    public List<PricedPositionResponse> positions(
            @PathVariable("accountId") long accountId,
            @RequestParam(name = "symbol", required = false) String symbol,
            HttpServletRequest request) {
        return portfolio.positions(AuthContext.requiredUserId(request), accountId, symbol);
    }

    @GetMapping("/pnl")
    public PnlResponse pnl(
            @PathVariable("accountId") long accountId,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "bySymbol", defaultValue = "false") boolean bySymbol,
            HttpServletRequest request) {
        return portfolio.pnl(AuthContext.requiredUserId(request), accountId, from, to, bySymbol);
    }

    /** Realised profit and loss alone (a team extension): needs no price, so it is never {@code MKT-503}. */
    @GetMapping("/realised")
    public RealisedPnlResponse realised(
            @PathVariable("accountId") long accountId,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "bySymbol", defaultValue = "false") boolean bySymbol,
            HttpServletRequest request) {
        return portfolio.realised(AuthContext.requiredUserId(request), accountId, from, to, bySymbol);
    }
}
