package org.example.backend.portfolio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * {@code RealisedPnlResponse} in {@code contracts/portfolio-api.yaml} (a team extension): only what was booked at sales,
 * in the account currency. It needs no price, so it never fails for want of one. {@code bySymbol} is present only when
 * it was asked for.
 */
public record RealisedPnlResponse(
        long accountId,
        String baseCurrency,
        LocalDate from,
        LocalDate to,
        BigDecimal realisedPnl,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<RealisedBySymbol> bySymbol,
        OffsetDateTime asOf) {
}
