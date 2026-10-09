package org.example.backend.portfolio.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * {@code PortfolioSummary} in {@code contracts/portfolio-api.yaml}. All money is in {@code baseCurrency}, the account's.
 * {@code dayPnl} and {@code dayPnlPercent} are the platform team's additive fields (see {@code CONTRACT-CHANGES.md}).
 */
public record PortfolioSummaryResponse(
        long accountId,
        String baseCurrency,
        BigDecimal cashBalance,
        BigDecimal marketValue,
        BigDecimal costBasis,
        BigDecimal unrealisedPnl,
        BigDecimal unrealisedPnlPercent,
        BigDecimal realisedPnl,
        BigDecimal totalValue,
        int positionCount,
        boolean partial,
        BigDecimal dayPnl,
        BigDecimal dayPnlPercent,
        OffsetDateTime asOf) {
}
