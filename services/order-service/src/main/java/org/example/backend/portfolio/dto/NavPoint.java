package org.example.backend.portfolio.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One closed day of the performance curve, in the account currency. {@code netFlow} is the money put in that day (the whole starting value on the first day). */
public record NavPoint(
        LocalDate date,
        BigDecimal nav,
        BigDecimal value,
        BigDecimal netFlow,
        BigDecimal dayPnl,
        BigDecimal unrealisedPnl,
        BigDecimal realisedPnlCumulative,
        boolean estimated) {
}
