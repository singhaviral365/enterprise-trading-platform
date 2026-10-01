package org.example.trade_executor.executor;

import org.example.backend.enums.OrderStatus;

import java.math.BigDecimal;
import java.util.Objects;

public record ExecutionOutcome(
        OrderStatus status,
        BigDecimal executionPrice,
        ExecutionRejectReason rejectReason) {

    public ExecutionOutcome {
        Objects.requireNonNull(status, "status is required");

        if (status == OrderStatus.FILLED) {
            Objects.requireNonNull(executionPrice, "executionPrice is required when filled");
            if (rejectReason != null) {
                throw new IllegalArgumentException("rejectReason must be null when filled");
            }
        }

        if (status == OrderStatus.REJECTED) {
            Objects.requireNonNull(rejectReason, "rejectReason is required when rejected");
            if (executionPrice != null) {
                throw new IllegalArgumentException("executionPrice must be null when rejected");
            }
        }

        if (status != OrderStatus.FILLED && status != OrderStatus.REJECTED) {
            throw new IllegalArgumentException("ExecutionOutcome only supports FILLED or REJECTED");
        }
    }

    public static ExecutionOutcome filled(BigDecimal executionPrice) {
        return new ExecutionOutcome(OrderStatus.FILLED, executionPrice, null);
    }

    public static ExecutionOutcome rejected(ExecutionRejectReason rejectReason) {
        return new ExecutionOutcome(OrderStatus.REJECTED, null, rejectReason);
    }

    public boolean isFilled() {
        return status == OrderStatus.FILLED;
    }

    public boolean isRejected() {
        return status == OrderStatus.REJECTED;
    }
}

