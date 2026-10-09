package org.example.backend.portfolio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * {@code PnlResponse} in {@code contracts/portfolio-api.yaml}. {@code bySymbol} is present only when it was asked for.
 * {@code dayPnl} is the platform team's additive field.
 */
public record PnlResponse(
        long accountId,
        String baseCurrency,
        LocalDate from,
        LocalDate to,
        BigDecimal realisedPnl,
        BigDecimal unrealisedPnl,
        BigDecimal totalPnl,
        BigDecimal dayPnl,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<SymbolPnl> bySymbol,
        OffsetDateTime asOf) {
}
