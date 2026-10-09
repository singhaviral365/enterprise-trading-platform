package org.example.backend.exceptions;

import java.util.UUID;

public final class OrderNotFoundException extends DomainException {

    private final UUID orderId;

    public OrderNotFoundException(UUID orderId) {
        super("ORD-409", "Order not found");
        this.orderId = orderId;
    }

    public UUID getOrderId() {
        return orderId;
    }
}
