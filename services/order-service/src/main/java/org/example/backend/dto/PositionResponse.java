package org.example.backend.dto;

import java.math.BigDecimal;

public record PositionResponse(
        Long accountId,
        String symbol,
        Integer quantity,
        BigDecimal averageCost) {
}
