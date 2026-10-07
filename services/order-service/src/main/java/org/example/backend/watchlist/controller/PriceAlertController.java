package org.example.backend.watchlist.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.example.backend.security.AuthContext;
import org.example.backend.watchlist.dto.SetPriceAlertRequest;
import org.example.backend.watchlist.dto.WatchlistResponse;
import org.example.backend.watchlist.service.PriceAlertService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The price alert on a watchlist entry: one alert per entry, set or replaced with PUT and removed with DELETE. Both
 * answer with the whole watchlist, like the other watchlist routes, so the client has one shape to render.
 */
@RestController
@RequestMapping("/api/v1/accounts/{accountId}/watchlists/{watchlistId}/items/{tickerSymbol}/alert")
@Validated
public class PriceAlertController {

    private final PriceAlertService alerts;

    public PriceAlertController(PriceAlertService alerts) {
        this.alerts = alerts;
    }

    @PutMapping
    public WatchlistResponse setAlert(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("watchlistId") @Min(1) long watchlistId,
            @PathVariable("tickerSymbol") String tickerSymbol,
            @Valid @RequestBody SetPriceAlertRequest request,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return alerts.setAlert(userId, accountId, watchlistId, tickerSymbol, request.direction(), request.targetPrice());
    }

    @DeleteMapping
    public WatchlistResponse clearAlert(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("watchlistId") @Min(1) long watchlistId,
            @PathVariable("tickerSymbol") String tickerSymbol,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return alerts.clearAlert(userId, accountId, watchlistId, tickerSymbol);
    }
}
