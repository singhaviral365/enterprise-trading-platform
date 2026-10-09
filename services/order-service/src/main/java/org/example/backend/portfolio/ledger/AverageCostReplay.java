package org.example.backend.portfolio.ledger;

import org.example.backend.enums.OrderSide;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Replays an account's filled orders with the executor's exact rule, to find the average cost at each sale.
 *
 * <p>The rule is the one in {@code OrderSettlementService}: a BUY sets the average to
 * {@code (avg * heldQty + price * boughtQty) / newQty}, scale 2, {@code HALF_UP} (so from nothing held it is just the
 * price); a SELL lowers the quantity and <b>never changes the average</b>. Reproducing the rounding exactly is the whole
 * point: a different rule would drift from the figures customers see on their positions by pennies.
 *
 * <p><b>An opening position.</b> The orders do not always explain everything held: a holding that was seeded, or carried
 * over from before orders were recorded, has no buys behind it. Selling it is a real sale with a real profit or loss,
 * so it must not be dropped. The holding row says what is held now and at what average cost, and a sale never changes
 * the average, so the replay can work backwards: whatever the filled orders do not account for was held at the start
 * ("the opening position"), and its cost is the one that makes the replay end at the average the holding shows.
 * That is found by search over cents, using the very same replay, so the rounding stays the executor's. If the cost
 * cannot be pinned down (the position went through zero, so the opening cost no longer shows in the final average) the
 * holding's current average is used for it and the sale is booked, not skipped.
 *
 * <p>Pure and deterministic: the answer depends only on the orders, their order and the holding, so a late or replayed
 * event, the consumer and the reconciler all book the same row for the same sale.
 */
public final class AverageCostReplay {

    private static final int SCALE = 2;
    private static final BigDecimal CENT = new BigDecimal("0.01");

    private AverageCostReplay() {
    }

    /** A sale with the average cost that applied just before it. */
    public record Sale(
            long orderId,
            String tickerSymbol,
            long quantity,
            BigDecimal fillPrice,
            BigDecimal averageCostAtSale,
            BigDecimal realisedPnl,
            java.time.OffsetDateTime bookedAt) {
    }

    /** What the replay found: the sales it could price, and the ones it could not (more sold than was ever held). */
    public record Result(List<Sale> sales, List<Long> unreconcilable) {
    }

    /** Replays with no knowledge of what is held now: only what the orders themselves explain. */
    public static Result replay(List<FilledOrder> filled) {
        return replay(filled, Map.of());
    }

    /**
     * {@code filled} must already be in execution order (transaction date, then id); orders may mix instruments.
     * {@code holdings} is what the account holds now, by upper-case symbol, and may be empty.
     */
    public static Result replay(List<FilledOrder> filled, Map<String, HoldingSnapshot> holdings) {
        Map<String, List<FilledOrder>> bySymbol = new LinkedHashMap<>();
        for (FilledOrder order : filled) {
            bySymbol.computeIfAbsent(order.tickerSymbol(), key -> new ArrayList<>()).add(order);
        }

        List<Sale> sales = new ArrayList<>();
        List<Long> unreconcilable = new ArrayList<>();
        for (Map.Entry<String, List<FilledOrder>> entry : bySymbol.entrySet()) {
            HoldingSnapshot holding = holdings.get(entry.getKey().toUpperCase());
            Opening opening = holding == null ? Opening.NONE : deriveOpening(entry.getValue(), holding);
            replaySymbol(entry.getValue(), opening, sales, unreconcilable);
        }

        // Keep the order the sales happened in, whatever the instrument.
        sales.sort(java.util.Comparator
                .comparing(Sale::bookedAt, java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder()))
                .thenComparingLong(Sale::orderId));
        return new Result(sales, unreconcilable);
    }

    // ---------------------------------------------------------------- the opening position

    /** A position held before the first order the history shows, and what it cost per unit. */
    public record Opening(long quantity, BigDecimal averageCost) {
        public static final Opening NONE = new Opening(0, BigDecimal.ZERO.setScale(SCALE));
    }

    /**
     * What the orders do not account for. Net of the orders the account would hold {@code bought - sold}; the holding
     * says it holds {@code quantity}; the difference was there before. No difference (or a negative one, which means the
     * holding is smaller than the orders imply and no opening position can explain it) gives no opening position.
     */
    public static Opening deriveOpening(List<FilledOrder> fills, HoldingSnapshot holding) {
        long bought = 0;
        long sold = 0;
        for (FilledOrder order : fills) {
            if (order.side() == OrderSide.BUY) {
                bought += order.quantity();
            } else {
                sold += order.quantity();
            }
        }
        long openingQuantity = holding.quantity() - (bought - sold);
        if (openingQuantity <= 0) {
            return Opening.NONE;
        }

        BigDecimal target = holding.averageCost().setScale(SCALE, RoundingMode.HALF_UP);

        // If the average does not depend on the opening cost at all, nothing in the history can reveal it: the position
        // went through zero, or the orders never touch it. Its own current average is then the best statement of the cost.
        BigDecimal atZero = finalAverage(fills, openingQuantity, cents(0));
        if (atZero == null || atZero.compareTo(target) >= 0) {
            return new Opening(openingQuantity, target);
        }

        long boughtQuantity = bought;
        // An upper bound for the opening cost, in cents: even if every buy cost nothing, the average would be
        // opening * q0 / (q0 + bought), so no opening cost above target * (q0 + bought) / q0 can be needed.
        BigDecimal ceiling = target.multiply(BigDecimal.valueOf(openingQuantity + boughtQuantity))
                .divide(BigDecimal.valueOf(openingQuantity), SCALE, RoundingMode.CEILING).add(CENT);
        long ceilingCents = ceiling.movePointRight(SCALE).longValueExact();

        // The final average is non-decreasing in the opening cost, so the costs that end at the target form a range
        // (rounding makes neighbouring cents land on the same average). Find its ends...
        long low = 0;
        long high = ceilingCents;
        while (low < high) {
            long middle = (low + high) >>> 1;
            BigDecimal finalAverage = finalAverage(fills, openingQuantity, cents(middle));
            if (finalAverage != null && finalAverage.compareTo(target) >= 0) {
                high = middle;
            } else {
                low = middle + 1;
            }
        }
        long first = low;
        BigDecimal reached = finalAverage(fills, openingQuantity, cents(first));
        if (reached == null || reached.compareTo(target) != 0) {
            return new Opening(openingQuantity, target);
        }

        low = first;
        high = ceilingCents;
        while (low < high) {
            long middle = (low + high + 1) >>> 1;
            BigDecimal finalAverage = finalAverage(fills, openingQuantity, cents(middle));
            if (finalAverage != null && finalAverage.compareTo(target) <= 0) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        long last = low;

        // ...and take the middle of it, which is the closest the cents can get to the true cost.
        return new Opening(openingQuantity, cents((first + last) / 2));
    }

    private static BigDecimal cents(long cents) {
        return BigDecimal.valueOf(cents, SCALE);
    }

    /** The average the executor would end with, or null if the orders could not have been applied to this position. */
    private static BigDecimal finalAverage(List<FilledOrder> fills, long openingQuantity, BigDecimal openingCost) {
        AverageCostLot position = new AverageCostLot(openingQuantity, openingCost);
        for (FilledOrder order : fills) {
            if (order.side() == OrderSide.BUY) {
                position.buy(order.quantity(), order.price());
            } else if (order.quantity() > position.quantity()) {
                return null;
            } else {
                position.sell(order.quantity());
            }
        }
        return position.averageCost();
    }

    // ---------------------------------------------------------------- the replay itself

    private static void replaySymbol(List<FilledOrder> fills, Opening opening, List<Sale> sales, List<Long> unreconcilable) {
        AverageCostLot position = new AverageCostLot(opening.quantity(), opening.averageCost());
        for (FilledOrder order : fills) {
            if (order.side() == OrderSide.BUY) {
                position.buy(order.quantity(), order.price());
                continue;
            }

            if (order.quantity() > position.quantity()) {
                // The history does not support this sale (it sold more than was ever held). Never guess.
                unreconcilable.add(order.orderId());
                continue;
            }

            BigDecimal averageCost = position.averageCost();
            BigDecimal realised = order.price().subtract(averageCost)
                    .multiply(BigDecimal.valueOf(order.quantity()))
                    .setScale(SCALE, RoundingMode.HALF_UP);
            sales.add(new Sale(
                    order.orderId(),
                    order.tickerSymbol(),
                    order.quantity(),
                    order.price(),
                    averageCost,
                    realised,
                    order.transactionDate()));
            position.sell(order.quantity());
        }
    }
}
