package org.example.backend.portfolio.ledger;

import org.example.backend.enums.OrderSide;
import org.example.backend.portfolio.mapper.PortfolioMapper;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;
import org.example.backend.portfolio.model.SymbolRealised;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * A stand-in for the database with the one rule the real one enforces that matters here: a sale is booked once. Inserting
 * the same order id again changes nothing and returns 0, as {@code ON CONFLICT (order_id) DO NOTHING} does.
 */
final class InMemoryPortfolioMapper implements PortfolioMapper {

    record Row(long orderId, long accountId, String symbol, long quantity, BigDecimal fillPrice,
               BigDecimal averageCostAtSale, BigDecimal realisedPnl, String currency, OffsetDateTime bookedAt) {
    }

    final Map<Long, List<FilledOrder>> filledByAccount = new LinkedHashMap<>();
    final Map<Long, Row> entries = new LinkedHashMap<>();
    final Map<Long, List<HoldingSnapshot>> holdingsByAccount = new LinkedHashMap<>();
    int selectFilledOrdersCalls;
    int insertAttempts;
    RuntimeException failFor;
    Long failAccount;

    void fill(long accountId, FilledOrder order) {
        filledByAccount.computeIfAbsent(accountId, key -> new ArrayList<>()).add(order);
    }

    @Override
    public int insertEntryIfNew(long orderId, long accountId, String tickerSymbol, long quantity, BigDecimal fillPrice,
                                BigDecimal averageCostAtSale, BigDecimal realisedPnl, String currency, OffsetDateTime bookedAt) {
        insertAttempts++;
        if (entries.containsKey(orderId)) {
            return 0;
        }
        entries.put(orderId, new Row(orderId, accountId, tickerSymbol, quantity, fillPrice, averageCostAtSale,
                realisedPnl, currency, bookedAt));
        return 1;
    }

    @Override
    public BigDecimal sumRealised(long accountId, OffsetDateTime from, OffsetDateTime to) {
        return entries.values().stream()
                .filter(row -> row.accountId() == accountId)
                .filter(row -> from == null || !row.bookedAt().isBefore(from))
                .filter(row -> to == null || row.bookedAt().isBefore(to))
                .map(Row::realisedPnl)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    @Override
    public List<SymbolRealised> sumRealisedBySymbol(long accountId, OffsetDateTime from, OffsetDateTime to) {
        Map<String, BigDecimal> sums = new TreeMap<>();
        entries.values().stream()
                .filter(row -> row.accountId() == accountId)
                .filter(row -> from == null || !row.bookedAt().isBefore(from))
                .filter(row -> to == null || row.bookedAt().isBefore(to))
                .forEach(row -> sums.merge(row.symbol(), row.realisedPnl(), BigDecimal::add));
        return sums.entrySet().stream().map(e -> new SymbolRealised(e.getKey(), e.getValue())).toList();
    }

    @Override
    public long countUnbookedSales(long accountId) {
        return filledByAccount.getOrDefault(accountId, List.of()).stream()
                .filter(order -> order.side() == OrderSide.SELL && !entries.containsKey(order.orderId()))
                .count();
    }

    @Override
    public List<Long> selectAccountsWithUnbookedSales() {
        return filledByAccount.keySet().stream().filter(account -> countUnbookedSales(account) > 0).toList();
    }

    void hold(long accountId, HoldingSnapshot holding) {
        holdingsByAccount.computeIfAbsent(accountId, key -> new ArrayList<>()).add(holding);
    }

    @Override
    public List<HoldingSnapshot> selectHoldings(long accountId) {
        return holdingsByAccount.getOrDefault(accountId, List.of());
    }

    @Override
    public List<FilledOrder> selectFilledOrders(long accountId) {
        selectFilledOrdersCalls++;
        if (failAccount != null && failAccount == accountId) {
            throw failFor;
        }
        return filledByAccount.getOrDefault(accountId, List.of());
    }
}
