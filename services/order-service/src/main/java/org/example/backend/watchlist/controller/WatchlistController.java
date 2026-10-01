package org.example.backend.watchlist.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.example.backend.watchlist.dto.AddWatchlistItemRequest;
import org.example.backend.watchlist.dto.CreateWatchlistRequest;
import org.example.backend.watchlist.dto.RenameWatchlistRequest;
import org.example.backend.watchlist.dto.WatchlistResponse;
import org.example.backend.security.AuthContext;
import org.example.backend.watchlist.service.WatchlistService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/accounts/{accountId}/watchlists")
@Validated
public class WatchlistController {

    private final WatchlistService watchlistService;

    public WatchlistController(WatchlistService watchlistService) {
        this.watchlistService = watchlistService;
    }

    @PostMapping
    public WatchlistResponse createWatchlist(
            @PathVariable("accountId") @Min(1) long accountId,
            @Valid @RequestBody CreateWatchlistRequest request,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return watchlistService.createWatchlist(userId, accountId, request.name());
    }

    @GetMapping
    public List<WatchlistResponse> listWatchlists(
            @PathVariable("accountId") @Min(1) long accountId,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return watchlistService.listWatchlists(userId, accountId);
    }

    @PatchMapping("/{watchlistId}")
    public WatchlistResponse renameWatchlist(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("watchlistId") @Min(1) long watchlistId,
            @Valid @RequestBody RenameWatchlistRequest request,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return watchlistService.renameWatchlist(userId, accountId, watchlistId, request.name());
    }

    @DeleteMapping("/{watchlistId}")
    public void deleteWatchlist(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("watchlistId") @Min(1) long watchlistId,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        watchlistService.deleteWatchlist(userId, accountId, watchlistId);
    }

    @PostMapping("/{watchlistId}/items")
    public WatchlistResponse addStock(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("watchlistId") @Min(1) long watchlistId,
            @Valid @RequestBody AddWatchlistItemRequest request,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return watchlistService.addStock(userId, accountId, watchlistId, request.tickerSymbol());
    }

    @DeleteMapping("/{watchlistId}/items/{tickerSymbol}")
    public WatchlistResponse removeStock(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("watchlistId") @Min(1) long watchlistId,
            @PathVariable("tickerSymbol") String tickerSymbol,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return watchlistService.removeStock(userId, accountId, watchlistId, tickerSymbol);
    }
}

