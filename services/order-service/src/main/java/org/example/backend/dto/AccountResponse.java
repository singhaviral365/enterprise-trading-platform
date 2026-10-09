package org.example.backend.dto;

import org.example.backend.enums.AccountStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record AccountResponse(
        Long id,
        String accountId,
        String holderName,
        BigDecimal cashBalance,
        AccountStatus status,
        Integer version,
        OffsetDateTime lastUpdated) {
}
