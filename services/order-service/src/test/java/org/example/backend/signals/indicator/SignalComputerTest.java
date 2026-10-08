package org.example.backend.signals.indicator;

import org.example.backend.signals.exceptions.InsufficientHistoryException;
import org.example.backend.signals.model.SignalDirection;
import org.example.backend.signals.model.SmaStatus;
import org.example.backend.signals.model.TradeSignal;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SignalComputerTest {

    private static final LocalDate AS_OF = LocalDate.parse("2026-10-06");

    private final SignalComputer computer = new SignalComputer();

    /** {@code days} closes starting at {@code start} and moving by {@code step} each day. */
    private static List<BigDecimal> trend(int days, double start, double step) {
        List<BigDecimal> closes = new ArrayList<>();
        for (int i = 0; i < days; i++) {
            closes.add(BigDecimal.valueOf(start + step * i));
        }
        return closes;
    }

    @Test
    void aSteadyRiseIsABuyWithABullishAverageGap() {
        TradeSignal signal = computer.compute(trend(60, 100, 1), AS_OF);

        assertEquals(SignalDirection.BUY, signal.direction());
        assertEquals(SmaStatus.BULLISH, signal.smaStatus());
        assertTrue(signal.sma20().compareTo(signal.sma50()) > 0);
        assertTrue(signal.price().compareTo(signal.sma20()) > 0);
        assertEquals(60, signal.sessions());
        assertEquals(AS_OF, signal.asOf());
    }

    @Test
    void aSteadyFallIsASellWithABearishAverageGap() {
        TradeSignal signal = computer.compute(trend(60, 200, -1), AS_OF);

        assertEquals(SignalDirection.SELL, signal.direction());
        assertEquals(SmaStatus.BEARISH, signal.smaStatus());
    }

    @Test
    void aFlatSeriesIsAHoldWithTheIndicatorsInBalance() {
        TradeSignal signal = computer.compute(trend(60, 100, 0), AS_OF);

        assertEquals(SignalDirection.HOLD, signal.direction());
        assertEquals(SmaStatus.FLAT, signal.smaStatus());
        assertEquals(0, signal.rsi().compareTo(BigDecimal.valueOf(50)));
        assertEquals(100, signal.strength());
    }

    @Test
    void anUptrendWhosePriceHasDroppedBelowTheShortAverageIsAHoldNotABuy() {
        List<BigDecimal> closes = trend(59, 100, 1);
        closes.add(BigDecimal.valueOf(100));

        TradeSignal signal = computer.compute(closes, AS_OF);

        assertEquals(SmaStatus.BULLISH, signal.smaStatus());
        assertEquals(SignalDirection.HOLD, signal.direction());
    }

    @Test
    void aDowntrendWhosePriceHasReboundedAboveTheShortAverageIsAHoldNotASell() {
        List<BigDecimal> closes = trend(59, 200, -1);
        closes.add(BigDecimal.valueOf(300));

        TradeSignal signal = computer.compute(closes, AS_OF);

        assertEquals(SmaStatus.BEARISH, signal.smaStatus());
        assertEquals(SignalDirection.HOLD, signal.direction());
    }

    @Test
    void fewerThanFiftyClosesCannotBeComputed() {
        InsufficientHistoryException ex =
                assertThrows(InsufficientHistoryException.class, () -> computer.compute(trend(49, 100, 1), AS_OF));
        assertEquals("SIG-422", ex.getErrorCode());
        assertEquals(49, ex.getHave());
        assertEquals(50, ex.getNeed());
        assertThrows(InsufficientHistoryException.class, () -> computer.compute(null, AS_OF));
    }

    @Test
    void exactlyFiftyClosesIsEnough() {
        assertEquals(50, computer.compute(trend(50, 100, 1), AS_OF).sessions());
    }

    @Test
    void strengthIsAlwaysBetweenZeroAndAHundred() {
        for (double step : new double[] {-3, -1, -0.1, 0, 0.1, 1, 3}) {
            int strength = computer.compute(trend(80, 150, step), AS_OF).strength();
            assertTrue(strength >= 0 && strength <= 100, "step " + step + " gave " + strength);
        }
    }

    @Test
    void aWideGapWithHealthyMomentumIsStrongerThanANarrowOne() {
        int wide = SignalComputer.strength(SignalDirection.BUY, 103, 100, 55);
        int narrow = SignalComputer.strength(SignalDirection.BUY, 100.3, 100, 55);

        assertEquals(100, wide);
        assertTrue(narrow < wide);
    }

    @Test
    void anOverboughtBuyIsWeakerThanOneWithRoomToRun() {
        int stretched = SignalComputer.strength(SignalDirection.BUY, 103, 100, 90);
        int healthy = SignalComputer.strength(SignalDirection.BUY, 103, 100, 55);

        assertTrue(stretched < healthy);
    }

    @Test
    void aSellIsJudgedOnTheMirrorImageOfTheRsi() {
        assertEquals(
                SignalComputer.strength(SignalDirection.BUY, 103, 100, 60),
                SignalComputer.strength(SignalDirection.SELL, 97, 100, 40));
    }

    @Test
    void aHoldIsStrongerTheNearerTheRsiIsToFifty() {
        assertEquals(100, SignalComputer.strength(SignalDirection.HOLD, 100, 100, 50));
        assertEquals(60, SignalComputer.strength(SignalDirection.HOLD, 100, 100, 70));
        assertEquals(0, SignalComputer.strength(SignalDirection.HOLD, 100, 100, 100));
    }
}
