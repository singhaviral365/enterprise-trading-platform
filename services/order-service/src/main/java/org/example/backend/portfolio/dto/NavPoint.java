package org.example.backend.portfolio.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One closed day of the performance curve, in the account currency. {@code value} is {@code cash + holdingsValue}; {@code costBasis}
 * is what the holdings cost, so {@code unrealisedPnl = holdingsValue - costBasis}. {@code netFlow} is the money put in that day (the whole
 * starting value on the first day).
 */
public record NavPoint(
        LocalDate date,
        BigDecimal nav,
        BigDecimal value,
        BigDecimal cash,
        BigDecimal holdingsValue,
        BigDecimal costBasis,
        BigDecimal netFlow,
        BigDecimal dayPnl,
        BigDecimal unrealisedPnl,
        BigDecimal realisedPnlCumulative,
        boolean estimated) {
}
