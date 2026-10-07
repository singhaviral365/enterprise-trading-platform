package org.example.trade_executor.strategy.model;

/** An order that already exists under a strategy's idempotency key, read only to link a duplicate to its first attempt. */
public record ExistingOrder(long orderId, String status) {

    public boolean isSettled() {
        return "FILLED".equals(status) || "REJECTED".equals(status) || "CANCELLED".equals(status);
    }
}
