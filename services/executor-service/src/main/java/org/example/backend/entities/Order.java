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

        this.orderId = orderId;
        this.idempotencyKey = idempotencyKey;
        this.orderStatus = orderStatus;
        this.receivedAt = receivedAt;
        this.orderSide = orderSide;
        this.pricingType = pricingType;
        this.price = price;
        this.quantity = quantity;
        this.transactionDate = transactionDate;
        this.accountId = accountId;
        this.instrumentId = instrumentId;
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
