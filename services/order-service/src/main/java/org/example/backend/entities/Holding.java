package org.example.backend.entities;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

public class Holding {

    @Positive
    private final long holdingId;

    @PositiveOrZero
    private long quantity;

    @NotNull
    @DecimalMin(value = "0.00")
    @Digits(integer = 17, fraction = 4)
    private BigDecimal purchasePrice;

    @Positive
    private final int accountId;

    @Positive
    private final int instrumentId;

    public Holding(
            long holdingId,
            long quantity,
            BigDecimal purchasePrice,
            int accountId,
            int instrumentId) {

        if (holdingId < 1) {
            throw new IllegalArgumentException(
                    "Holding ID must be at least 1");
        }

        if (quantity < 0) {
            throw new IllegalArgumentException(
                    "Position quantity cannot be negative");
        }

        Objects.requireNonNull(
                purchasePrice,
                "Purchase price is required");

        if (purchasePrice.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException(
                    "Purchase price cannot be negative");
        }

        if (purchasePrice.scale() > 4) {
            throw new IllegalArgumentException(
                "Purchase price cannot have more than four decimal places");
        }

        if (accountId < 1) {
            throw new IllegalArgumentException(
                    "Account ID must be at least 1");
        }

        if (instrumentId < 1) {
            throw new IllegalArgumentException(
                    "Instrument ID must be at least 1");
        }

        this.holdingId = holdingId;
        this.quantity = quantity;
        this.purchasePrice = purchasePrice.setScale(4);
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

    public void createHolding(long quantity) {

        if (quantity < 0) {
            throw new IllegalArgumentException(
                    "Quantity cannot be negative"
            );
        }

        this.quantity = quantity;
    }
}
