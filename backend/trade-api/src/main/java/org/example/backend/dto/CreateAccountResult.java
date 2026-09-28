package org.example.backend.dto;

public record CreateAccountResult(
        long accountId,
        String accountNumber,
        String status,
        String message) {
}

