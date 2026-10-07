package org.example.backend.portfolio.performance;

import org.example.backend.portfolio.dto.PerformanceSummary;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class PerformanceMathTest {

    private static NavRow row(LocalDate date, String nav, String value, String flow) {
        return new NavRow(date, BigDecimal.ZERO, new BigDecimal(value), new BigDecimal(value), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, new BigDecimal(flow), BigDecimal.ZERO, BigDecimal.ONE, new BigDecimal(nav), false);
    }

    @Test
    void returnIsTheNavChangeAndPnlIsTheValueChangeLessMoneyPutIn() {
        LocalDate d = LocalDate.of(2026, 9, 1);
        PerformanceSummary summary = PerformanceMath.summarise(List.of(
                row(d, "1000", "10000", "10000"),
                row(d.plusDays(1), "1000", "15000", "5000"),
                row(d.plusDays(2), "1066.666667", "16000", "0")));

        assertEquals(new BigDecimal("6.67"), summary.returnPct());
        assertEquals(new BigDecimal("1000.00"), summary.pnl(), "16,000 - 10,000 - 5,000 put in");
        assertNull(summary.annualisedPct(), "only over a year");
    }

    @Test
    void maxDrawdownIsTheWorstFallFromAPeakAndBestAndWorstDayAreSingleDayChanges() {
        LocalDate d = LocalDate.of(2026, 9, 1);
        PerformanceSummary summary = PerformanceMath.summarise(List.of(
                row(d, "1000", "1", "1"), row(d.plusDays(1), "1100", "1", "0"),
                row(d.plusDays(2), "990", "1", "0"), row(d.plusDays(3), "1050", "1", "0")));

        assertEquals(new BigDecimal("-10.00"), summary.maxDrawdownPct(), "1100 down to 990");
        assertEquals(new BigDecimal("10.00"), summary.bestDayPct());
        assertEquals(new BigDecimal("-10.00"), summary.worstDayPct());
    }

    @Test
    void annualisedReturnIsGivenOnlyOverMoreThanAYear() {
        LocalDate d = LocalDate.of(2024, 1, 1);
        List<NavRow> rows = new ArrayList<>();
        rows.add(row(d, "1000", "1", "1"));
        rows.add(row(d.plusDays(730), "1210", "1", "0"));

        PerformanceSummary summary = PerformanceMath.summarise(rows);

        assertEquals(new BigDecimal("21.00"), summary.returnPct());
        assertEquals(new BigDecimal("10.00"), summary.annualisedPct(), "21% over two years is about 10% a year");
    }

    @Test
    void oneDayHasNoBestOrWorstDay() {
        PerformanceSummary summary = PerformanceMath.summarise(List.of(row(LocalDate.of(2026, 9, 1), "1000", "1", "1")));

        assertNull(summary.bestDayPct());
        assertNull(summary.worstDayPct());
        assertEquals(new BigDecimal("0.00"), summary.returnPct());
    }
}
