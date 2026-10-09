package org.example.backend.signals.indicator;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class IndicatorsTest {

    /** The closing prices of the standard worked RSI example (StockCharts' "RSI" chart-school page). */
    private static final List<Double> WORKED_EXAMPLE = List.of(
            44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4766, 45.8415, 46.0827, 45.8930, 46.0328,
            45.6140, 46.2820, 46.2820, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7138, 46.4515,
            45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314);

    @Test
    void smaIsTheMeanOfTheLastPeriodCloses() {
        assertEquals(6.0, Indicators.sma(List.of(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0), 3), 1e-9);
        assertEquals(3.5, Indicators.sma(List.of(1.0, 2.0, 3.0, 4.0, 5.0, 6.0), 6), 1e-9);
    }

    @Test
    void smaNeedsAsManyClosesAsItsPeriod() {
        assertThrows(IllegalArgumentException.class, () -> Indicators.sma(List.of(1.0, 2.0), 3));
        assertThrows(IllegalArgumentException.class, () -> Indicators.sma(List.of(1.0, 2.0), 0));
    }

    @Test
    void rsiMatchesTheWorkedExampleAtItsFirstValue() {
        // 14 changes need 15 closes; the published first value is 70.53.
        assertEquals(70.53, Indicators.rsi(WORKED_EXAMPLE.subList(0, 15), 14), 0.01);
    }

    @Test
    void rsiAppliesWildersSmoothingFromThenOn() {
        assertEquals(66.32, Indicators.rsi(WORKED_EXAMPLE.subList(0, 16), 14), 0.01);
        assertEquals(37.77, Indicators.rsi(WORKED_EXAMPLE, 14), 0.01);
    }

    @Test
    void aRunThatNeverFellIs100OneThatNeverRoseIs0AndOneThatNeverMovedIs50() {
        List<Double> up = new ArrayList<>();
        List<Double> down = new ArrayList<>();
        List<Double> flat = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            up.add(100.0 + i);
            down.add(100.0 - i);
            flat.add(100.0);
        }
        assertEquals(100.0, Indicators.rsi(up, 14), 1e-9);
        assertEquals(0.0, Indicators.rsi(down, 14), 1e-9);
        assertEquals(50.0, Indicators.rsi(flat, 14), 1e-9);
    }

    @Test
    void rsiNeedsOneMoreCloseThanItsPeriod() {
        assertThrows(IllegalArgumentException.class, () -> Indicators.rsi(WORKED_EXAMPLE.subList(0, 14), 14));
    }
}
