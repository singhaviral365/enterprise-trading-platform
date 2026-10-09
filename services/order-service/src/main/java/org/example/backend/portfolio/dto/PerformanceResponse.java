package org.example.backend.portfolio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDate;
import java.util.List;

/**
 * {@code PerformanceResponse} in {@code contracts/portfolio-performance-api.yaml}: the closed-day history of an account and
 * its NAV curve. Only stored statements: the route never calls the market data vendor. {@code estimated} is true if any day
 * in the range used an estimated price; {@code availableFrom} is the first day there is a statement for.
 */
public record PerformanceResponse(
        long accountId,
        String baseCurrency,
        boolean estimated,
        LocalDate availableFrom,
        PerformanceSummary summary,
        List<NavPoint> points,
        @JsonInclude(JsonInclude.Include.NON_NULL) BenchmarkSeries benchmark) {
}
