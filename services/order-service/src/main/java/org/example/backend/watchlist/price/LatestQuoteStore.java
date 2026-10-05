package org.example.backend.watchlist.price;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Latest quote per symbol, filled by the market-data consumer and read when a watchlist is returned.
 *
 * <p>Held in memory only. Prices are never written to a database or any other store, and a restart
 * simply starts empty and refills from the stream.
 *
 * <p>It is the "index" for the per-message question the consumer asks: a hash lookup by symbol,
 * O(1) however many quotes arrive, with no database on the hot path. It is bounded so a stream of
 * unexpected symbols cannot grow it without limit, and it only ever replaces a quote with a newer
 * one, so a replayed or out-of-order message cannot move a price backwards.
 */
@Component
public class LatestQuoteStore implements QuoteSource {

    private static final Logger LOGGER = LoggerFactory.getLogger(LatestQuoteStore.class);

    private final ConcurrentHashMap<String, Quote> quotes = new ConcurrentHashMap<>();
    private final int maxSymbols;

    public LatestQuoteStore(@Value("${watchlist.price.max-symbols:5000}") int maxSymbols) {
        this.maxSymbols = Math.max(1, maxSymbols);
    }

    /**
     * @return true if the store changed; false if the quote was not newer than the one held,
     *         or the store is full and the symbol is new
     */
    public boolean offer(Quote quote) {
        boolean[] changed = {false};

        quotes.compute(key(quote.symbol()), (k, current) -> {
            if (current == null) {
                if (quotes.size() >= maxSymbols) {
                    LOGGER.warn("Quote store is full ({} symbols); ignoring new symbol {}", maxSymbols, quote.symbol());
                    return null;
                }
                changed[0] = true;
                return quote;
            }
            if (quote.quotedAt().isAfter(current.quotedAt())) {
                changed[0] = true;
                return quote;
            }
            return current;
        });

        return changed[0];
    }

    public Optional<Quote> latest(String symbol) {
        return Optional.ofNullable(quotes.get(key(symbol)));
    }

    @Override
    public Map<String, Quote> latest(Collection<String> symbols) {
        Map<String, Quote> found = new HashMap<>();
        for (String symbol : symbols) {
            Quote quote = quotes.get(key(symbol));
            if (quote != null) {
                found.put(key(symbol), quote);
            }
        }
        return found;
    }

    public int size() {
        return quotes.size();
    }

    private static String key(String symbol) {
        return symbol.trim().toUpperCase(Locale.ROOT);
    }
}
