package org.example.backend.portfolio.performance;

import org.example.backend.portfolio.dto.PerformanceSummary;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * What a range of the NAV curve came to: return, profit, annualised return (only over a year), the worst fall from a peak, and the
 * best and worst single day. Computed from stored closed-day statements; percentages are percentage points, two places.
 */
final class PerformanceMath {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private PerformanceMath() {
    }

    /** @param rows the statements in the range, oldest first; at least one */
    static PerformanceSummary summarise(List<NavRow> rows) {
        NavRow first = rows.get(0);
        NavRow last = rows.get(rows.size() - 1);

        BigDecimal returnRatio = last.nav().divide(first.nav(), 12, RoundingMode.HALF_UP).subtract(BigDecimal.ONE);

        // What the market and our own decisions made: the change in value, less any money put in after the first day.
        BigDecimal flowsAfterStart = BigDecimal.ZERO;
        for (int i = 1; i < rows.size(); i++) {
            flowsAfterStart = flowsAfterStart.add(rows.get(i).netFlow());
        }
        BigDecimal pnl = last.totalValue().subtract(first.totalValue()).subtract(flowsAfterStart);

        long days = ChronoUnit.DAYS.between(first.date(), last.date());
        BigDecimal annualised = null;
        if (days > 365) {
            double ratio = Math.pow(1 + returnRatio.doubleValue(), 365.0 / days) - 1;
            annualised = BigDecimal.valueOf(ratio * 100).setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal peak = first.nav();
        BigDecimal worstDrawdown = BigDecimal.ZERO;
        BigDecimal best = null;
        BigDecimal worst = null;
        for (int i = 0; i < rows.size(); i++) {
            BigDecimal nav = rows.get(i).nav();
            if (nav.compareTo(peak) > 0) {
                peak = nav;
            }
            BigDecimal drawdown = nav.divide(peak, 12, RoundingMode.HALF_UP).subtract(BigDecimal.ONE);
            if (drawdown.compareTo(worstDrawdown) < 0) {
                worstDrawdown = drawdown;
            }
            if (i > 0) {
                BigDecimal change = nav.divide(rows.get(i - 1).nav(), 12, RoundingMode.HALF_UP).subtract(BigDecimal.ONE);
                if (best == null || change.compareTo(best) > 0) {
                    best = change;
                }
                if (worst == null || change.compareTo(worst) < 0) {
                    worst = change;
                }
            }
        }

        return new PerformanceSummary(
                percent(returnRatio),
                pnl.setScale(2, RoundingMode.HALF_UP),
                annualised,
                percent(worstDrawdown),
                best == null ? null : percent(best),
                worst == null ? null : percent(worst));
    }

    private static BigDecimal percent(BigDecimal ratio) {
        return ratio.multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP);
    }
}
