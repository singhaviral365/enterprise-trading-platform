package org.example.trade_executor.strategy.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** A row to write to {@code strategy_run}. */
public record NewRun(
        long strategyId,
        int runNumber,
        BigDecimal quotePrice,
        OffsetDateTime quoteAt,
        RunOutcome outcome,
        Long orderId,
        String detail) {
}
