package org.example.backend.watchlist.alert;

import org.example.backend.watchlist.model.AlertWatch;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The answer to the question the market-data consumer asks of every quote: does any customer care about this symbol?
 *
 * <p>It is a hash map keyed by symbol, holding the ACTIVE alerts for that symbol (keyed by watchlist, because an entry
 * is one watchlist's one ticker). A symbol nobody watches costs one hash lookup and nothing else: no database, no lock,
 * however many quotes arrive. The database is only touched when a quote actually crosses a level.
 *
 * <p>It is a cache of the {@code watchlist_item} rows whose {@code alert_status} is ACTIVE (the partial index
 * {@code idx_watchlist_item_active_alert} is how they are loaded). It is filled at start-up and kept in step by the
 * routes that set and clear alerts, after the change commits. It is bounded by the per-account alert cap, not by quote
 * volume. It is per instance: like the quote store, it assumes one order-service instance (see the module README).
 */
@Component
public class PriceAlertIndex {

    private final ConcurrentHashMap<String, ConcurrentHashMap<Long, AlertWatch>> bySymbol = new ConcurrentHashMap<>();

    /** Arms (or replaces, for the same watchlist and symbol) an alert. */
    public void put(AlertWatch watch) {
        bySymbol.computeIfAbsent(key(watch.tickerSymbol()), k -> new ConcurrentHashMap<>())
                .put(watch.watchlistId(), watch);
    }

    public void remove(long watchlistId, String tickerSymbol) {
        bySymbol.computeIfPresent(key(tickerSymbol), (k, watches) -> {
            watches.remove(watchlistId);
            return watches.isEmpty() ? null : watches;
        });
    }

    /** The active alerts on this symbol; an empty list, without allocating one per call, when there are none. */
    public List<AlertWatch> candidates(String symbol) {
        ConcurrentHashMap<Long, AlertWatch> watches = bySymbol.get(key(symbol));
        return watches == null ? List.of() : List.copyOf(watches.values());
    }

    public int size() {
        return bySymbol.values().stream().mapToInt(ConcurrentHashMap::size).sum();
    }

    public void clear() {
        bySymbol.clear();
    }

    private static String key(String symbol) {
        return symbol.trim().toUpperCase(Locale.ROOT);
    }
}
