package org.example.backend.dto;

import org.example.backend.enums.AccountStatus;

import java.math.BigDecimal;

public record AuthAccountResponse(
        long accountId,
        String accountNumber,
        AccountStatus accountStatus,
        BigDecimal balance,
        BigDecimal purchasingPower) {
}

