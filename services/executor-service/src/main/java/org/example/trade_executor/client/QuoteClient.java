package org.example.trade_executor.client;

import java.time.LocalDate;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

public interface QuoteClient {

    Optional<LiveQuote> getQuote(String symbol);

    default Map<String, LiveQuote> getQuotes(Collection<String> symbols) {
        Map<String, LiveQuote> quotes = new LinkedHashMap<>();
        if (symbols == null) {
            return quotes;
        }

        for (String symbol : symbols) {
            if (symbol == null || symbol.isBlank()) {
                continue;
            }
            getQuote(symbol).ifPresent(quote -> quotes.put(quote.symbol(), quote));
        }

        return quotes;
    }

    /**
     * Full quotes (all fields the API returned), keyed by symbol. Symbols the API could not quote
     * are left out. The default only knows symbol and price; FauxnanceQuoteClient returns everything.
     */
    default Map<String, QuoteDetails> getQuoteDetails(Collection<String> symbols) {
        Map<String, QuoteDetails> details = new LinkedHashMap<>();
        getQuotes(symbols).forEach((symbol, quote) -> {
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("symbol", quote.symbol());
            fields.put("price", quote.price());
            details.put(symbol, new QuoteDetails(quote.symbol(), quote.price(), fields));
        });
        return details;
    }

    /**
     * Historical candles for {@code symbol} between {@code from} and {@code to} (inclusive). The default has no
     * history; FauxnanceQuoteClient calls the /candles endpoint.
     */
    default PriceHistory getCandles(String symbol, LocalDate from, LocalDate to, String interval) {
        return PriceHistory.empty(symbol, interval);
    }
}

