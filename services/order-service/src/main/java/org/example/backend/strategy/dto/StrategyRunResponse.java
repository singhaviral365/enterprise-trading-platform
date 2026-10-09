package org.example.backend.strategy.dto;

import org.example.backend.strategy.model.RunOutcome;
import org.example.backend.strategy.model.StrategyRun;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record StrategyRunResponse(
        long runId,
        int runNumber,
        RunOutcome outcome,
        BigDecimal quotePrice,
        OffsetDateTime quoteAt,
        Long orderId,
        String detail,
        String settledStatus,
        OffsetDateTime createdAt) {

    public static StrategyRunResponse from(StrategyRun run) {
        return new StrategyRunResponse(
                run.runId(),
                run.runNumber(),
                run.outcome(),
                run.quotePrice(),
                run.quoteAt(),
                run.orderId(),
                run.detail(),
                run.settledStatus(),
                run.createdAt());
    }
}
