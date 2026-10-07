package org.example.backend.watchlist.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import org.example.backend.watchlist.model.AlertDirection;

import java.math.BigDecimal;

/** The alert to arm on a watchlist entry: a direction and a target price, in the unit of the entry's own price. */
public record SetPriceAlertRequest(
        @NotNull AlertDirection direction,
        @NotNull
        @DecimalMin(value = "0", inclusive = false)
        @DecimalMax("1000000000")
        @Digits(integer = 10, fraction = 4)
        BigDecimal targetPrice) {
}
