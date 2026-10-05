package org.example.backend.watchlist.price;

import java.util.Collection;
import java.util.Map;

/**
 * Where watchlist prices come from. Prices are never stored in a database: the only copy is the
 * in-memory one the market-data consumer keeps, read when a watchlist is shown. The service depends
 * on this interface, not on Kafka or on how the latest quote is held.
 */
public interface QuoteSource {

    /**
     * The latest quote for each of the given symbols that has one.
     *
     * @return quotes keyed by upper-cased symbol; symbols with no quote are absent
     */
    Map<String, Quote> latest(Collection<String> symbols);
}
