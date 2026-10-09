package org.example.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record LinkAccountStatusResponse(
        boolean linked,
        String message,
        String accountNumber) {
}