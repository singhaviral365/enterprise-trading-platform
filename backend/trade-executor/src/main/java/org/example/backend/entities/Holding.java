package org.example.backend.entities;

import java.math.BigDecimal;
import java.util.Objects;

public class Holding {

    private final long holdingId;
    private long quantity;
    private BigDecimal purchasePrice;
    private final int accountId;
    private final int instrumentId;

    public Holding(long holdingId, long quantity, BigDecimal purchasePrice, int accountId, int instrumentId) {
        this.holdingId = holdingId;
        this.quantity = quantity;
        this.purchasePrice = Objects.requireNonNull(purchasePrice, "purchasePrice is required");
        this.accountId = accountId;
        this.instrumentId = instrumentId;
    }

    public long getHoldingId() {
        return holdingId;
    }

    public long getQuantity() {
        return quantity;
    }

    public BigDecimal getPurchasePrice() {
        return purchasePrice;
    }

    public int getAccountId() {
        return accountId;
    }

    public int getInstrumentId() {
        return instrumentId;
    }

    public void setQuantity(long quantity) {
        this.quantity = quantity;
    }

    public void setPurchasePrice(BigDecimal purchasePrice) {
        this.purchasePrice = Objects.requireNonNull(purchasePrice, "purchasePrice is required");
    }
}

