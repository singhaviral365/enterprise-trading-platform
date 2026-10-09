package org.example.backend.portfolio.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** A benchmark close, rebased so the first point of the range is 1000 like the portfolio's NAV. */
public record BenchmarkPoint(LocalDate date, BigDecimal nav) {
}
