package org.example.backend.exceptions;

import java.util.UUID;

public final class OrderNotCancellableException extends DomainException {

    private final UUID orderId;

    public OrderNotCancellableException(UUID orderId) {
        super("ORD-409", "Order is not cancellable");
        this.orderId = orderId;
    }

    public UUID getOrderId() {
        return orderId;
    }
}
