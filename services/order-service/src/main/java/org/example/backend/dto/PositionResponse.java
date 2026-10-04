package org.example.backend.dto;

import java.math.BigDecimal;

public record PositionResponse(
        Long accountId,
        String symbol,
        String instrumentName,
        String iconUrl,
        Integer quantity,
        BigDecimal averageCost) {
}
