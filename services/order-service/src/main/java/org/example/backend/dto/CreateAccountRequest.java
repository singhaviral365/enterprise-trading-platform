package org.example.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CreateAccountRequest(
        @JsonProperty("client_name")
        @NotBlank
        @Size(min = 2, max = 100)
        String clientName,

        @JsonProperty("phone_no")
        @NotBlank
        @Size(min = 10, max = 20)
        @Pattern(regexp = "^\\+?[0-9\\s\\-()]{10,20}$")
        String phoneNo,

        @NotBlank
        @Email
        @Size(max = 255)
        String email,

        LocalDate dob,

        BigDecimal balance,

        /** ISO 4217 code of the account currency, chosen once. Optional: USD when left out. */
        @Pattern(regexp = "^[A-Z]{3}$")
        String currency) {
}

