package org.example.backend.portfolio.performance;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NavCalculatorTest {

    private static final LocalDate D0 = LocalDate.of(2026, 9, 1);

    private static NavCalculator.DayValue day(int offset, String cash, String holdings, String flow) {
        return new NavCalculator.DayValue(D0.plusDays(offset), new BigDecimal(cash), new BigDecimal(holdings),
                new BigDecimal(holdings), BigDecimal.ZERO, new BigDecimal(flow), false);
    }

    @Test
    void theFirstDayWithValueStartsAt1000AndItsWholeValueIsTheFunding() {
        List<NavRow> rows = NavCalculator.compute(List.of(day(0, "10000", "0", "0")));

        assertEquals(new BigDecimal("1000"), rows.get(0).nav());
        assertEquals(0, new BigDecimal("10").compareTo(rows.get(0).units()), "10,000 / 1,000 = 10 units");
        assertEquals(0, new BigDecimal("10000").compareTo(rows.get(0).netFlow()));
        assertEquals(0, BigDecimal.ZERO.compareTo(rows.get(0).dayPnl()));
    }

    @Test
    void aDepositCreatesUnitsAtThePreviousNavSoItCannotMoveTheNav() {
        // 10,000 -> 10 units. Add 5,000: 5 new units, 15 units, NAV still 1,000, and no gain shown.
        List<NavRow> rows = NavCalculator.compute(List.of(day(0, "10000", "0", "0"), day(1, "15000", "0", "5000")));

        assertEquals(0, new BigDecimal("15").compareTo(rows.get(1).units()));
        assertEquals(0, new BigDecimal("1000").compareTo(rows.get(1).nav()));
        assertEquals(0, BigDecimal.ZERO.compareTo(rows.get(1).dayPnl()), "money put in is not profit");
    }

    @Test
    void theNextDaysGainMovesTheNav() {
        List<NavRow> rows = NavCalculator.compute(List.of(
                day(0, "10000", "0", "0"), day(1, "15000", "0", "5000"), day(2, "15000", "1000", "0")));

        assertEquals(new BigDecimal("1066.666667"), rows.get(2).nav());
        assertEquals(0, new BigDecimal("1000").compareTo(rows.get(2).dayPnl()));
    }

    @Test
    void aWithdrawalCancelsUnitsAtThePreviousNav() {
        List<NavRow> rows = NavCalculator.compute(List.of(day(0, "10000", "0", "0"), day(1, "6000", "0", "-4000")));

        assertEquals(0, new BigDecimal("6").compareTo(rows.get(1).units()));
        assertEquals(0, new BigDecimal("1000").compareTo(rows.get(1).nav()));
    }

    @Test
    void aTradeSwapsCashForSharesAndChangesNothing() {
        List<NavRow> rows = NavCalculator.compute(List.of(day(0, "10000", "0", "0"), day(1, "9000", "1000", "0")));

        assertEquals(0, new BigDecimal("1000").compareTo(rows.get(1).nav()));
        assertEquals(0, BigDecimal.ZERO.compareTo(rows.get(1).dayPnl()));
    }

    @Test
    void daysBeforeThereIsAnyValueAreSkipped() {
        List<NavRow> rows = NavCalculator.compute(List.of(day(0, "0", "0", "0"), day(1, "0", "0", "0"), day(2, "500", "0", "0")));

        assertEquals(1, rows.size());
        assertEquals(D0.plusDays(2), rows.get(0).date());
    }

    @Test
    void anEmptiedAccountCarriesTheLastNavNeverDividingByZero() {
        List<NavRow> rows = NavCalculator.compute(List.of(day(0, "10000", "0", "0"), day(1, "0", "0", "0")));

        assertEquals(2, rows.size());
        assertEquals(0, new BigDecimal("1000").compareTo(rows.get(1).nav()));
        assertTrue(rows.get(1).nav().signum() > 0);
    }

    @Test
    void unrealisedIsHoldingsLessCostAndTheDayKeepsItsEstimatedFlag() {
        var estimated = new NavCalculator.DayValue(D0, new BigDecimal("100"), new BigDecimal("1200"), new BigDecimal("1000"),
                new BigDecimal("50"), BigDecimal.ZERO, true);

        NavRow row = NavCalculator.compute(List.of(estimated)).get(0);

        assertEquals(0, new BigDecimal("200").compareTo(row.unrealisedPnl()));
        assertEquals(0, new BigDecimal("50").compareTo(row.realisedPnlCumulative()));
        assertTrue(row.estimated());
    }
}
