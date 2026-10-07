package org.example.backend.portfolio.quote;

import java.util.Collection;
import java.util.Map;

/** Where prices come from. A seam so the cache and the valuation are tested without a network. */
public interface QuoteSource {

    /**
     * One batched call for up to {@code portfolio.quote.max-symbols-per-call} symbols. Symbols Fauxnance does not know
     * are simply absent from the answer.
     *
     * @throws QuoteSourceException when the call cannot be completed (not configured, unreachable, quota, server error)
     */
    Map<String, Quote> fetch(Collection<String> symbols);

    /** The daily quota Fauxnance reports as left, or null if unknown. Costs quota to ask, so implementations ask rarely. */
    default Integer remainingQuota() {
        return null;
    }
}
