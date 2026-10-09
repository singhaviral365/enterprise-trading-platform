package org.example.trade_executor.controller;

import org.example.trade_executor.client.PriceHistory;
import org.example.trade_executor.market.MarketBoard;
import org.example.trade_executor.market.MarketQuoteService;
import org.example.trade_executor.market.PriceHistoryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/market")
public class MarketController {

    private final MarketQuoteService marketQuoteService;
    private final PriceHistoryService priceHistoryService;

    public MarketController(MarketQuoteService marketQuoteService, PriceHistoryService priceHistoryService) {
        this.marketQuoteService = marketQuoteService;
        this.priceHistoryService = priceHistoryService;
    }

    @GetMapping("/quotes")
    public MarketBoard getQuotes() {
        return marketQuoteService.getBoard();
    }

    /** Daily candles for the past year, oldest first. */
    @GetMapping("/candles/{symbol}")
    public PriceHistory getCandles(@PathVariable String symbol) {
        return priceHistoryService.getLastYear(symbol);
    }
}
