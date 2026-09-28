package org.example.backend.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record BalanceResponse(
        Long accountId,
        BigDecimal cashBalance,
        String currency,
        OffsetDateTime asOf) {
}
