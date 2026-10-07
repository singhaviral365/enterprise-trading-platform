package org.example.backend.portfolio.performance;

import org.example.backend.enums.OrderSide;
import org.example.backend.portfolio.ledger.AverageCostLot;
import org.example.backend.portfolio.model.FilledOrder;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Replays an account's filled orders day by day to say what it held, and how much cash it had, at the end of each day.
 * Cash starts at the starting cash and a BUY lowers it by its fill value and a SELL raises it, exactly as the executor settled
 * them (fill prices are in the account currency, like every stored price). Holdings follow the executor's weighted-average rule
 * (see {@link AverageCostLot}), starting from any opening position the orders do not explain.
 *
 * <p>Pure and deterministic, so a closed day always replays to the same state. Orders dated before the first day are applied on it.
 */
public final class HistoryReplay {

    private HistoryReplay() {
    }

    /** What the account held at the end of one day. */
    public record DayState(LocalDate date, BigDecimal cash, Map<String, AverageCostLot> lots) {
    }

    /**
     * @param startCash cash on the day before the first order (the platform's opening deposit, derived by the caller)
     * @param opening   positions held before the first order, by symbol; copied, never changed
     * @param filled    the account's filled orders in execution order (transaction date, then id)
     */
    public static List<DayState> replay(
            LocalDate start,
            LocalDate end,
            BigDecimal startCash,
            Map<String, AverageCostLot> opening,
            List<FilledOrder> filled) {

        Map<String, AverageCostLot> lots = new TreeMap<>();
        opening.forEach((symbol, lot) -> lots.put(symbol, lot.copy()));
        BigDecimal cash = startCash;

        List<DayState> states = new ArrayList<>();
        int next = 0;
        for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
            while (next < filled.size() && !dateOf(filled.get(next)).isAfter(day)) {
                FilledOrder order = filled.get(next++);
                BigDecimal value = order.price().multiply(BigDecimal.valueOf(order.quantity()));
                AverageCostLot lot = lots.computeIfAbsent(order.tickerSymbol(), key -> AverageCostLot.empty());
                if (order.side() == OrderSide.BUY) {
                    cash = cash.subtract(value);
                    lot.buy(order.quantity(), order.price());
                } else {
                    cash = cash.add(value);
                    // The orders cannot sell more than was held; if they appear to, hold nothing rather than go negative.
                    lot.sell(Math.min(order.quantity(), lot.quantity()));
                }
            }

            Map<String, AverageCostLot> held = new LinkedHashMap<>();
            lots.forEach((symbol, lot) -> {
                if (lot.quantity() > 0) {
                    held.put(symbol, lot.copy());
                }
            });
            states.add(new DayState(day, cash.setScale(4, RoundingMode.HALF_UP), held));
        }
        return states;
    }

    private static LocalDate dateOf(FilledOrder order) {
        return order.transactionDate().withOffsetSameInstant(ZoneOffset.UTC).toLocalDate();
    }
}
