package org.example.trade_executor.client;

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
}

