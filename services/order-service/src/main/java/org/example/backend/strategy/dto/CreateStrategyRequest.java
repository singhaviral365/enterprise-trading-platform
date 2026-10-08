package org.example.backend.strategy.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.example.backend.enums.OrderSide;
import org.example.backend.strategy.model.TriggerDirection;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * A new strategy. A strategy that trades when nobody is watching must have its damage bounded, so the two limits always
 * exist on the saved strategy, but the customer need not type them: when {@code maxOrderValue} or {@code maxPositionQty} is
 * left out, {@code StrategyService} works it out from the rule (see {@code StrategyLimitDefaults}). A value that is sent is
 * used and validated exactly as before. {@code maxExecutions} and {@code maxFailures} may be left out and then default to
 * 1 and 3.
 */
public record CreateStrategyRequest(
        @NotNull @Min(1) Long accountId,
        @NotBlank @Size(min = 1, max = 20) String symbol,
        @NotNull OrderSide side,
        @NotNull @Min(1) Long quantity,
        @NotNull TriggerDirection direction,
        @NotNull @DecimalMin(value = "0.00", inclusive = false) @Digits(integer = 14, fraction = 4) BigDecimal triggerPrice,
        OffsetDateTime validFrom,
        OffsetDateTime validUntil,
        @DecimalMin(value = "0.00", inclusive = false) @Digits(integer = 15, fraction = 2) BigDecimal maxOrderValue,
        @Min(1) Long maxPositionQty,
        @Min(1) @Max(20) Integer maxExecutions,
        @Min(1) @Max(10) Integer maxFailures) {

    @AssertTrue(message = "The end of the window must be after its start")
    public boolean isWindowOrdered() {
        return validFrom == null || validUntil == null || validUntil.isAfter(validFrom);
    }

    public int maxExecutionsOrDefault() {
        return maxExecutions == null ? 1 : maxExecutions;
    }

    public int maxFailuresOrDefault() {
        return maxFailures == null ? 3 : maxFailures;
    }
}
