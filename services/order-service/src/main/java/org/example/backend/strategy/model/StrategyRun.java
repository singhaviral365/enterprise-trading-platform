package org.example.backend.strategy.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** One row of a strategy's audit trail: an attempt to run it, and what came of it. */
public record StrategyRun(
        long runId,
        long strategyId,
        int runNumber,
        BigDecimal quotePrice,
        OffsetDateTime quoteAt,
        RunOutcome outcome,
        Long orderId,
        String detail,
        String settledStatus,
        OffsetDateTime settledAt,
        OffsetDateTime createdAt) {
}
