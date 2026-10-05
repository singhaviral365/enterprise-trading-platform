package org.example.backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.AssertTrue;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderPricingType;

import java.math.BigDecimal;

public record PlaceOrderRequest(
        @NotNull @Min(1) Long accountId,
        @NotBlank @Size(min = 1, max = 20) String symbol,
        @NotNull OrderSide side,
        @NotNull OrderPricingType orderPricingType,
        @NotNull @Min(1) Integer quantity,
        @DecimalMin(value = "0.00", inclusive = false) @Digits(integer = 17, fraction = 4) BigDecimal price,
        @NotBlank @Size(min = 8, max = 100) String idempotencyKey) {

    @AssertTrue(message = "LIMIT orders require price; MARKET orders must not include price")
    public boolean isPriceConsistentWithOrderType() {
        if (orderPricingType == null) {
            return true;
        }

        return switch (orderPricingType) {
            case LIMIT -> price != null;
            case MARKET -> price == null;
        };
    }
}
