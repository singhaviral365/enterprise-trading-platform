package org.example.backend.portfolio.performance;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Realised profit and loss booked on one UTC day. */
public record DayRealised(LocalDate day, BigDecimal realisedPnl) {
}
