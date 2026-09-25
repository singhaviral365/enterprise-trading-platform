package org.example.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;

public record LinkAccountRequest(
        @JsonProperty("user_id")
        @Min(1)
        long userId,

        @JsonProperty("account_id")
        @Min(1)
        long accountId) {
}

