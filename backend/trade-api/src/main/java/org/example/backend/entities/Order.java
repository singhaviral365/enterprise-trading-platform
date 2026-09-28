package org.example.backend.entities;

import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public class Order {

    @Positive
    private final long orderId;

    @NotBlank
    @Size(max = 100)
    private final String idempotencyKey;

    @NotNull
    private OrderStatus orderStatus;

    @NotNull
    private final OffsetDateTime receivedAt;

    @NotNull
    private final OrderSide orderSide;

    @NotNull
    private final OrderPricingType pricingType;

    @DecimalMin(value = "0.00", inclusive = false)
    @Digits(integer = 17, fraction = 4)
    private final BigDecimal price;

    @Positive
    private final long quantity;

    private OffsetDateTime transactionDate;

    @Positive
    private final int accountId;

    @Positive
    private final int instrumentId;

    public Order(
            long orderId,
            String idempotencyKey,
            OrderStatus orderStatus,
            OffsetDateTime receivedAt,
            OrderSide orderSide,
            OrderPricingType pricingType,
            BigDecimal price,
            long quantity,
            OffsetDateTime transactionDate,
            int accountId,
            int instrumentId) {

        if (orderId < 1) {
            throw new IllegalArgumentException(
                    "Order ID must be at least 1");
        }

        if (idempotencyKey == null
                || idempotencyKey.isBlank()) {

            throw new IllegalArgumentException(
                    "Idempotency key is required");
        }

        if (idempotencyKey.length() > 100) {
            throw new IllegalArgumentException(
                    "Idempotency key cannot exceed 100 characters");
        }

        if (orderStatus == null) {
            throw new IllegalArgumentException(
                    "Order status is required");
        }

        if (receivedAt == null) {
            throw new IllegalArgumentException(
                    "Received timestamp is required");
        }

        if (orderSide == null) {
            throw new IllegalArgumentException(
                    "Order side is required");
        }

        if (pricingType == null) {
            throw new IllegalArgumentException(
                    "Order pricing type is required");
        }

        if (price != null) {

            if (price.compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException(
                        "Price must be greater than zero");
            }

            if (price.scale() > 4) {
                throw new IllegalArgumentException(
                        "Price cannot have more than four decimal places");
            }
        }

        if (quantity <= 0) {
            throw new IllegalArgumentException(
                    "Quantity must be greater than zero");
        }

        if (accountId < 1) {
            throw new IllegalArgumentException(
                    "Account ID must be at least 1");
        }

        if (instrumentId < 1) {
            throw new IllegalArgumentException(
                    "Instrument ID must be at least 1");
        }

        this.orderId = orderId;
        this.idempotencyKey = idempotencyKey;
        this.orderStatus = orderStatus;
        this.receivedAt = receivedAt;
        this.orderSide = orderSide;
        this.pricingType = pricingType;
        this.price = price == null
                ? null
                : price.setScale(4);
        this.quantity = quantity;
        this.transactionDate = transactionDate;
        this.accountId = accountId;
        this.instrumentId = instrumentId;
    }

    public void fill() {

        if (orderStatus != OrderStatus.NEW) {
            throw new IllegalStateException(
                    "Only a received order can be filled");
        }

        orderStatus = OrderStatus.FILLED;

        if (transactionDate == null) {
            transactionDate = OffsetDateTime.now();
        }
    }

    public void reject() {

        if (orderStatus != OrderStatus.NEW) {
            throw new IllegalStateException(
                    "Only a received order can be rejected");
        }

        orderStatus = OrderStatus.REJECTED;

        if (transactionDate == null) {
            transactionDate = OffsetDateTime.now();
        }
    }

    public void cancel() {

        if (orderStatus != OrderStatus.NEW) {
            throw new IllegalStateException(
                    "Only a received order can be cancelled");
        }

        orderStatus = OrderStatus.CANCELLED;

        if (transactionDate == null) {
            transactionDate = OffsetDateTime.now();
        }
    }

    public long getOrderId() {
        return orderId;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public OrderStatus getOrderStatus() {
        return orderStatus;
    }

    public OffsetDateTime getReceivedAt() {
        return receivedAt;
    }

    public OrderSide getOrderSide() {
        return orderSide;
    }

    public OrderPricingType getPricingType() {
        return pricingType;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public long getQuantity() {
        return quantity;
    }

    public OffsetDateTime getTransactionDate() {
        return transactionDate;
    }

    public int getAccountId() {
        return accountId;
    }

    public int getInstrumentId() {
        return instrumentId;
    }
}
