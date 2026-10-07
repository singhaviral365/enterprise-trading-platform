package org.example.backend.portfolio.performance;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Turns a run of closed days, each valued, into the end-of-day statements and the NAV curve, the way a fund does it: the
 * account is a pool of <i>units</i>, the unit price is the <b>NAV</b>, and money put in or taken out only creates or cancels
 * units, so it cannot move the NAV. Only the market moves it (trades swap cash for shares and change nothing).
 *
 * <pre>
 *   first day with value:  NAV = 1000,  units = V / 1000,  F = V  (everything present at the start is the funding)
 *   a later flow F:        units += F / NAV(previous day)
 *   every day:             NAV = V / units,   dayPnl = V(d) - V(d-1) - F(d)
 * </pre>
 *
 * An empty account (value 0, or no units) pauses the curve: the last NAV is carried, never a divide by zero.
 * Pure and deterministic: the same days always give the same statements, which is why a closed day can be written once.
 */
public final class NavCalculator {

    static final BigDecimal START_NAV = new BigDecimal("1000");
    private static final int MONEY = 4;
    private static final int UNITS = 8;
    private static final int NAV = 6;
    private static final MathContext PRECISE = new MathContext(24, RoundingMode.HALF_UP);

    private NavCalculator() {
    }

    /**
     * One closed day, valued.
     *
     * @param netFlow money (or securities) put in or taken out that day, other than the starting value; zero on every day while
     *                the platform has no deposits or withdrawals
     */
    public record DayValue(
            LocalDate date,
            BigDecimal cash,
            BigDecimal holdingsValue,
            BigDecimal costBasis,
            BigDecimal realisedPnlCumulative,
            BigDecimal netFlow,
            boolean estimated) {
    }

    public static List<NavRow> compute(List<DayValue> days) {
        List<NavRow> rows = new ArrayList<>();
        BigDecimal units = BigDecimal.ZERO;
        BigDecimal previousValue = null;
        BigDecimal previousNav = null;

        for (DayValue day : days) {
            BigDecimal value = day.cash().add(day.holdingsValue()).setScale(MONEY, RoundingMode.HALF_UP);

            BigDecimal flow;
            BigDecimal nav;
            BigDecimal dayPnl;
            if (previousValue == null) {
                if (value.signum() <= 0) {
                    continue; // nothing to measure yet
                }
                flow = value;
                nav = START_NAV;
                units = value.divide(START_NAV, UNITS, RoundingMode.HALF_UP);
                dayPnl = BigDecimal.ZERO;
            } else {
                flow = day.netFlow() == null ? BigDecimal.ZERO : day.netFlow();
                if (flow.signum() != 0) {
                    units = units.add(flow.divide(previousNav, PRECISE)).setScale(UNITS, RoundingMode.HALF_UP);
                }
                dayPnl = value.subtract(previousValue).subtract(flow);
                nav = units.signum() <= 0 || value.signum() <= 0
                        ? previousNav
                        : value.divide(units, PRECISE).setScale(NAV, RoundingMode.HALF_UP);
            }

            BigDecimal holdings = day.holdingsValue().setScale(MONEY, RoundingMode.HALF_UP);
            BigDecimal cost = day.costBasis().setScale(MONEY, RoundingMode.HALF_UP);
            rows.add(new NavRow(
                    day.date(),
                    day.cash().setScale(MONEY, RoundingMode.HALF_UP),
                    holdings,
                    value,
                    cost,
                    holdings.subtract(cost),
                    day.realisedPnlCumulative().setScale(MONEY, RoundingMode.HALF_UP),
                    flow.setScale(MONEY, RoundingMode.HALF_UP),
                    dayPnl.setScale(MONEY, RoundingMode.HALF_UP),
                    units,
                    nav,
                    day.estimated()));
            previousValue = value;
            previousNav = nav;
        }
        return rows;
    }
}
