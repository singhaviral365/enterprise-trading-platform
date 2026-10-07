package org.example.backend.portfolio.dto;

import java.math.BigDecimal;

/**
 * What a range of the curve came to. Percentages are percentage points ({@code 4.2} is 4.2 per cent). {@code annualisedPct}
 * is only given for a range longer than a year; best and worst day need at least two days.
 */
public record PerformanceSummary(
        BigDecimal returnPct,
        BigDecimal pnl,
        BigDecimal annualisedPct,
        BigDecimal maxDrawdownPct,
        BigDecimal bestDayPct,
        BigDecimal worstDayPct) {
}
