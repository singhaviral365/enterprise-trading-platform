package org.example.trade_executor.controller;

import org.example.trade_executor.market.MarketBoard;
import org.example.trade_executor.market.MarketQuoteService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/market")
public class MarketController {

    private final MarketQuoteService marketQuoteService;

    public MarketController(MarketQuoteService marketQuoteService) {
        this.marketQuoteService = marketQuoteService;
    }

    @GetMapping("/quotes")
    public MarketBoard getQuotes() {
        return marketQuoteService.getBoard();
    }
}
