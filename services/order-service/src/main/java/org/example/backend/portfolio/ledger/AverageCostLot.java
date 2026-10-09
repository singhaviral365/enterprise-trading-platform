package org.example.backend.portfolio.ledger;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * One instrument's holding under the executor's weighted-average rule: a BUY sets the average to
 * {@code (avg * heldQty + price * boughtQty) / newQty} at scale 2, {@code HALF_UP} (from nothing held it is just the price),
 * and a SELL lowers the quantity and never changes the average. Shared by the sale replay (realised profit and loss) and the
 * day-by-day history replay (end-of-day statements), so both follow the one rule.
 */
public final class AverageCostLot {

    private static final int SCALE = 2;

    private long quantity;
    private BigDecimal averageCost;

    public AverageCostLot(long quantity, BigDecimal averageCost) {
        this.quantity = quantity;
        this.averageCost = averageCost.setScale(SCALE, RoundingMode.HALF_UP);
    }

    public static AverageCostLot empty() {
        return new AverageCostLot(0, BigDecimal.ZERO);
    }

    public void buy(long boughtQuantity, BigDecimal price) {
        long newQuantity = quantity + boughtQuantity;
        BigDecimal held = averageCost.multiply(BigDecimal.valueOf(quantity));
        BigDecimal incoming = price.multiply(BigDecimal.valueOf(boughtQuantity));
        averageCost = held.add(incoming).divide(BigDecimal.valueOf(newQuantity), SCALE, RoundingMode.HALF_UP);
        quantity = newQuantity;
    }

    public void sell(long soldQuantity) {
        quantity -= soldQuantity;
    }

    public long quantity() {
        return quantity;
    }

    public BigDecimal averageCost() {
        return averageCost;
    }

    /** What the units held cost, at the average. */
    public BigDecimal costBasis() {
        return averageCost.multiply(BigDecimal.valueOf(quantity)).setScale(SCALE, RoundingMode.HALF_UP);
    }

    public AverageCostLot copy() {
        return new AverageCostLot(quantity, averageCost);
    }
}
